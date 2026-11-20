import { browse, retrieve, relations as fetchRelations, definition as fetchDefinition } from './source.mjs';
import { interpret, interpretRelations, interpretDefinition } from './interpret.mjs';
import { assess, assessEvidence, checkDefinition, summarize } from './receiving.mjs';

export async function preview(client, path) {
  const manifest = await browse(client, path);
  const entries = [];
  for (const ref of manifest.references) {
    const document = await retrieve(client, ref);
    entries.push(interpret(document.raw));
  }
  return { context: manifest.context, entries };
}

export async function collect(client, archive, scope, operator, path) {
  const manifest = await browse(client, path);
  const outcomes = [];
  const relations = [];
  for (const reference of manifest.references) {
    let digest;
    try {
      const document = await retrieve(client, reference);
      digest = await archive.preserve(document);
      const record = interpret(document.raw);
      const prior = archive.records(scope).filter(item => item.decision.status === 'accepted').map(item => item.record);
      const decision = assess(record, prior, scope);
      if (operator && decision.status === 'accepted') decision.portal = await operator(record);
      archive.put(scope, decision.key ?? record.customer + ':' + record.object, digest, record, decision);
      const outcome = { reference: reference.identity, digest, ...decision };
      outcomes.push(outcome);
      if (record.customer === scope) {
        // 只跟随本轮范围内对象声明的关系定向收齐，不遍历对方整个项目
        const found = await collectRelations(client, archive, scope, record, manifest.path);
        relations.push(...found.items);
        if (found.status !== 'ok' && found.status !== 'none') {
          outcome.relations = found.status;
          outcome.relationsReason = found.reason;
        }
      }
    } catch (error) {
      outcomes.push({ reference: reference.identity, digest, status: 'error', reason: error.message });
    }
  }
  const summary = summarize(outcomes);
  const observed = outcomes.every(outcome => outcome.relations === undefined);
  const settled = relations.every(item => item.status === 'resolved' && item.definition.status === 'compatible');
  return { context: manifest.context, complete: summary.complete && observed && settled, counts: summary.counts, outcomes, relations };
}

async function collectRelations(client, archive, scope, record, catalog) {
  const source = record.customer + ':' + record.object;
  let document;
  try {
    document = await fetchRelations(client, record.object, catalog);
  } catch (error) {
    if (error.status === 404) return { status: 'none', items: [] };
    return { status: 'unavailable', reason: error.message, items: [] };
  }
  let relationsDocument;
  try {
    relationsDocument = interpretRelations(document.raw);
  } catch (error) {
    return { status: 'invalid', reason: error.message, items: [] };
  }
  let definition = null;
  try {
    definition = interpretDefinition((await fetchDefinition(client, relationsDocument.definition, catalog)).raw);
  } catch (error) {
    definition = null;
  }
  const items = [];
  for (const relation of relationsDocument.relations) {
    const base = {
      source, view: relationsDocument.view, target: relation.customer + ':' + relation.target,
      permission: relation.permission, href: relation.href,
      definition: checkDefinition(relation.permission, relationsDocument.definition, definition),
      observedAt: new Date().toISOString(),
    };
    let item;
    try {
      const targetDocument = await client.get(relation.href);
      if (targetDocument.raw.object !== relation.target) throw new Error('原文身份与关系引用不符');
      if (targetDocument.raw.customer !== relation.customer) throw new Error('原文上下文与关系引用不符');
      const targetRecord = interpret(targetDocument.raw);
      const digest = await archive.preserve(targetDocument);
      const decision = assessEvidence(targetRecord, relation.permission);
      archive.put(scope, decision.key, digest, targetRecord, decision);
      item = { ...base, status: 'resolved', digest };
    } catch (error) {
      // 未获准看的引用目标留下带来源的未解析关系，不补空对象
      item = { ...base, status: 'unresolved', reason: error.message };
      if (error.status) item.sourceStatus = error.status;
    }
    archive.putRelation(scope, item);
    items.push(item);
  }
  return { status: 'ok', items };
}

// 交付审阅人员的结果：说明每个关系的来源、目标或定义缺口，
// 区分可回传修改清单与只读依据；已取得的证据对象不混入回传
export function report(archive, scope) {
  const records = archive.records(scope);
  const pick = status => [...new Set(records.filter(item => item.decision.status === status).map(item => item.business_key))];
  const counts = {};
  for (const item of records) counts[item.decision.status] = (counts[item.decision.status] ?? 0) + 1;
  return { scope, returnable: pick('accepted'), evidence: pick('evidence'), relations: archive.relations(scope), counts };
}
