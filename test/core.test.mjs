import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceClient } from '../src/http.mjs';
import { fixtureSource } from '../src/fixture-source.mjs';
import { Archive } from '../src/archive.mjs';
import { interpret } from '../src/interpret.mjs';
import { assess } from '../src/receiving.mjs';
import { collect, preview, report } from '../src/app.mjs';

const raw = {"object": "R1", "customer": "A", "type": "requirement", "heading": "供电要求", "text": "额定供电符合合同条件", "editable": true};
const evidenceRaw = {"object": "T1", "customer": "A", "type": "evidence", "heading": "供电试验报告", "text": "型式试验结论留档备查", "editable": false};
const scope = "A";
const fixture = JSON.parse(await readFile(new URL('../fixtures/source.json', import.meta.url), 'utf8'));

test('解释来源业务字段并拒绝缺失身份', () => {
  const record = interpret(raw);
  assert.equal(record.object, raw.object);
  assert.throws(() => interpret({ ...raw, object: '' }));
  assert.throws(() => interpret(null));
  assert.throws(() => interpret([]));
});

test('范围外记录不计入当前收件', () => {
  assert.equal(assess(interpret(raw), [], scope).status, 'accepted');
  assert.equal(assess(interpret(raw), [], 'another-scope').status, 'outside');
});

test('真实来源领取与重复收件保留单份原文依据', async () => {
  const source = await fixtureSource(fixture);
  const directory = await mkdtemp(join(tmpdir(), 'receive-'));
  const archive = await new Archive(directory).start();
  try {
    const client = new SourceClient(source.url);
    const before = await preview(client);
    assert.equal(before.entries.length, 1);
    const first = await collect(client, archive, scope);
    const second = await collect(client, archive, scope);
    assert.equal(first.complete, true);
    assert.equal(second.complete, true);
    assert.equal(archive.records(scope).length, 2);
    assert.equal(first.relations.length, 1);
    assert.equal(first.relations[0].source, 'A:R1');
    assert.equal(first.relations[0].target, 'A:T1');
    assert.equal(first.relations[0].status, 'resolved');
    assert.equal(first.relations[0].definition.status, 'compatible');
    const original = await archive.original(first.outcomes[0].digest);
    assert.deepEqual(JSON.parse(original.toString()), raw);
    const evidenceOriginal = await archive.original(first.relations[0].digest);
    assert.deepEqual(JSON.parse(evidenceOriginal.toString()), evidenceRaw);
    // 定向收齐：只访问目录、原件、关系、定义与引用目标，不遍历对方整个项目
    const allowed = new Set(['/exchange/customer-A', '/exchange/customer-A/records/R1', '/exchange/customer-A/relations/R1', '/exchange/customer-A/definitions/E', '/exchange/customer-A/views/V1/objects/T1']);
    assert.ok(source.accesses.length > 0);
    assert.ok(source.accesses.every(item => allowed.has(item.path)));
    // 交付审阅：说明关系来源与目标，只读依据不混入可回传清单
    const delivery = report(archive, scope);
    assert.deepEqual(delivery.returnable, ['A:R1']);
    assert.deepEqual(delivery.evidence, ['A:T1']);
    assert.equal(delivery.relations.length, 1);
    assert.equal(delivery.relations[0].source, 'A:R1');
    assert.equal(delivery.relations[0].status, 'resolved');
  } finally { archive.close(); await source.close(); await rm(directory, { recursive: true, force: true }); }
});

test('未获准的引用目标留下带来源的未解析关系，视图开放后补收不重复', async () => {
  const source = await fixtureSource(fixture);
  const directory = await mkdtemp(join(tmpdir(), 'resume-'));
  const archive = await new Archive(directory).start();
  try {
    source.replace('/exchange/customer-A/views/V1/objects/T1', { status: 403, body: { error: '视图未开放' } });
    const client = new SourceClient(source.url);
    const first = await collect(client, archive, scope);
    assert.equal(first.complete, false);
    assert.equal(first.relations.length, 1);
    assert.equal(first.relations[0].status, 'unresolved');
    assert.equal(first.relations[0].source, 'A:R1');
    assert.equal(first.relations[0].target, 'A:T1');
    assert.equal(first.relations[0].sourceStatus, 403);
    // 不补空对象：未解析目标不产生收件记录
    assert.equal(archive.records(scope).length, 1);
    assert.deepEqual(archive.relations(scope).map(item => item.status), ['unresolved']);
    // 客户后来开放视图，接着补收
    source.replace('/exchange/customer-A/views/V1/objects/T1', { body: evidenceRaw });
    const second = await collect(client, archive, scope);
    assert.equal(second.complete, true);
    assert.equal(second.relations[0].status, 'resolved');
    assert.equal(archive.records(scope).length, 2);
    assert.equal(archive.records(scope).filter(item => item.business_key === 'A:R1').length, 1);
    assert.equal(archive.records(scope).filter(item => item.business_key === 'A:T1').length, 1);
    assert.equal(archive.relations(scope)[0].status, 'resolved');
    const delivery = report(archive, scope);
    assert.deepEqual(delivery.returnable, ['A:R1']);
    assert.deepEqual(delivery.evidence, ['A:T1']);
  } finally { archive.close(); await source.close(); await rm(directory, { recursive: true, force: true }); }
});

test('枚举定义先更新而对象仍用旧值时标注定义缺口，不按显示文字硬转', async () => {
  const source = await fixtureSource(fixture);
  const directory = await mkdtemp(join(tmpdir(), 'enum-'));
  const archive = await new Archive(directory).start();
  try {
    source.replace('/exchange/customer-A/definitions/E', { body: { enum: 'E', version: '2', values: [
      { value: 'read-only-evidence', label: '只读证据' },
      { value: 'editable-return', label: '可回传编辑' },
    ] } });
    const result = await collect(new SourceClient(source.url), archive, scope);
    assert.equal(result.complete, false);
    assert.equal(result.relations.length, 1);
    const relation = result.relations[0];
    assert.equal(relation.status, 'resolved');
    assert.equal(relation.permission, 'evidence-only');
    assert.equal(relation.definition.status, 'definition-gap');
    assert.equal(relation.definition.declared, '1');
    assert.equal(relation.definition.current, '2');
    assert.equal(relation.definition.valueCurrent, false);
    // 定义缺口下证据仍只作只读依据，不混入可回传清单
    const delivery = report(archive, scope);
    assert.deepEqual(delivery.returnable, ['A:R1']);
    assert.deepEqual(delivery.evidence, ['A:T1']);
    assert.equal(delivery.relations[0].detail.definition.status, 'definition-gap');
  } finally { archive.close(); await source.close(); await rm(directory, { recursive: true, force: true }); }
});

test('两家客户系统使用相同对象编号与显示名也不合并', async () => {
  const fixtureB = {
    resources: {
      '/exchange/customer-B': { body: { customer: 'B', objects: [{ id: 'R1', href: '/exchange/customer-B/records/R1' }] } },
      '/exchange/customer-B/records/R1': { body: { object: 'R1', customer: 'B', type: 'requirement', heading: '供电要求', text: '另一客户系统的同名需求', editable: true } },
    },
  };
  const sources = await Promise.all([fixtureSource(fixture), fixtureSource(fixtureB)]);
  const directory = await mkdtemp(join(tmpdir(), 'customers-'));
  const archive = await new Archive(directory).start();
  try {
    const first = await collect(new SourceClient(sources[0].url), archive, 'A');
    const second = await collect(new SourceClient(sources[1].url), archive, 'B', undefined, '/exchange/customer-B');
    assert.equal(first.complete, true);
    assert.equal(second.complete, true);
    assert.deepEqual(archive.records('A').map(item => item.business_key), ['A:R1', 'A:T1']);
    assert.deepEqual(archive.records('B').map(item => item.business_key), ['B:R1']);
    const [a] = archive.records('A').filter(item => item.business_key === 'A:R1');
    const [b] = archive.records('B').filter(item => item.business_key === 'B:R1');
    assert.equal(a.record.heading, b.record.heading);
    assert.notEqual(a.record.text, b.record.text);
    assert.deepEqual(report(archive, 'B').returnable, ['B:R1']);
  } finally { archive.close(); await Promise.all(sources.map(item => item.close())); await rm(directory, { recursive: true, force: true }); }
});

test('对象关系入口暂时不可用时标注观察缺口，不虚报收齐', async () => {
  const source = await fixtureSource(fixture);
  const directory = await mkdtemp(join(tmpdir(), 'relations-'));
  const archive = await new Archive(directory).start();
  try {
    source.fail('/exchange/customer-A/relations/R1', 503, 2);
    const result = await collect(new SourceClient(source.url), archive, scope);
    assert.equal(result.complete, false);
    assert.equal(result.outcomes[0].status, 'accepted');
    assert.equal(result.outcomes[0].relations, 'unavailable');
    assert.equal(archive.records(scope).length, 1);
    assert.equal(archive.relations(scope).length, 0);
  } finally { archive.close(); await source.close(); await rm(directory, { recursive: true, force: true }); }
});

test('来源一次暂时失败可重试，永久缺件不虚报完成', async () => {
  const source = await fixtureSource(fixture);
  const directory = await mkdtemp(join(tmpdir(), 'failures-'));
  const archive = await new Archive(directory).start();
  try {
    source.fail("/exchange/customer-A/records/R1", 503, 1);
    assert.equal((await collect(new SourceClient(source.url), archive, scope)).complete, true);
    source.replace("/exchange/customer-A/records/R1", { status: 404, body: { error: '原件暂不存在' } });
    const result = await collect(new SourceClient(source.url), archive, scope);
    assert.equal(result.complete, false);
    assert.equal(result.outcomes[0].status, 'error');
    assert.equal(archive.records(scope).length, 2);
  } finally { archive.close(); await source.close(); await rm(directory, { recursive: true, force: true }); }
});

test('目录身份与原文上下文不一致时拒绝接收', async () => {
  const source = await fixtureSource(fixture);
  const directory = await mkdtemp(join(tmpdir(), 'identity-'));
  const archive = await new Archive(directory).start();
  try {
    source.replace("/exchange/customer-A/records/R1", { body: { ...raw, customer: 'unrelated-context' } });
    const result = await collect(new SourceClient(source.url), archive, scope);
    assert.equal(result.complete, false);
    assert.equal(archive.records(scope).length, 0);
  } finally { archive.close(); await source.close(); await rm(directory, { recursive: true, force: true }); }
});

test('重开资料库保留收据与完整性检测', async () => {
  const source = await fixtureSource(fixture);
  const directory = await mkdtemp(join(tmpdir(), 'restart-'));
  let archive = await new Archive(directory).start();
  try {
    const first = await collect(new SourceClient(source.url), archive, scope);
    archive.close(); archive = await new Archive(directory).start();
    assert.equal(archive.records(scope).length, 2);
    assert.equal(archive.relations(scope).length, 1);
    const digest = first.outcomes[0].digest;
    await writeFile(join(directory, 'objects', digest), '损坏内容');
    await assert.rejects(archive.original(digest), /完整性/);
    await assert.rejects(archive.original('../outside'), /摘要/);
  } finally { archive.close(); await source.close(); await rm(directory, { recursive: true, force: true }); }
});

test('限制来源边界与正文资源', async () => {
  const source = await fixtureSource(fixture);
  try {
    const client = new SourceClient(source.url, { maxBytes: 4 });
    await assert.rejects(client.get("/exchange/customer-A"), /限制/);
    await assert.rejects(client.get('http://outside.invalid/data'), /边界/);
    source.replace('/invalid', { bytes: '{broken-json' });
    await assert.rejects(new SourceClient(source.url).get('/invalid'));
  } finally { await source.close(); }
});

test('多个来源实例与存储实例相互隔离', async () => {
  const sources = await Promise.all([fixtureSource(fixture), fixtureSource(fixture)]);
  try {
    assert.notEqual(sources[0].url, sources[1].url);
    sources[0].replace("/exchange/customer-A/records/R1", { status: 403, body: { error: '无权领取' } });
    await assert.rejects(new SourceClient(sources[0].url).get("/exchange/customer-A/records/R1"));
    assert.equal((await new SourceClient(sources[1].url).get("/exchange/customer-A/records/R1")).raw.object, raw.object);
  } finally { await Promise.all(sources.map(source => source.close())); }
});
