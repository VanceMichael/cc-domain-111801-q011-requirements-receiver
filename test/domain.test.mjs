import test from 'node:test';
import assert from 'node:assert/strict';
import { interpret, interpretRelations, interpretDefinition } from '../src/interpret.mjs';
import { assess, assessEvidence, checkDefinition, summarize } from '../src/receiving.mjs';
const raw = {"object": "R1", "customer": "A", "type": "requirement", "heading": "供电要求", "text": "额定供电符合合同条件", "editable": true};
const scope = "A";

test('领域记录保留明确的来源上下文', () => {
  const actual = interpret(raw);
  assert.equal(actual.customer, raw.customer);
  assert.equal(assess(actual, [actual], scope).status, 'accepted');
});
test('同一业务依据发生矛盾时不能覆盖接收', () => {
  const first = interpret(raw);
  const changed = interpret({"object": "R1", "customer": "A", "type": "requirement", "heading": "供电要求", "text": "另一条需求", "editable": true});
  assert.equal(assess(changed, [first], scope).status, 'conflict');
});
test('空目录与范围外内容不声明完成', () => {
  assert.equal(summarize([]).complete, false);
  const outcome = assess(interpret(raw), [], 'other-scope');
  assert.equal(summarize([outcome]).complete, false);
  assert.equal(summarize([outcome]).counts.outside, 1);
});

test('引用目标只作只读依据，不进入可回传清单', () => {
  const record = interpret({"object": "T1", "customer": "A", "type": "evidence", "heading": "供电试验报告", "text": "型式试验结论留档备查", "editable": false});
  const decision = assessEvidence(record, 'evidence-only');
  assert.equal(decision.status, 'evidence');
  assert.equal(decision.key, 'A:T1');
  assert.equal(decision.permission, 'evidence-only');
  assert.notEqual(decision.status, 'accepted');
});

test('对象关系资料保留视图、授权入口与枚举定义引用', () => {
  const document = interpretRelations({
    view: 'V1',
    relations: [{ target: 'T1', customer: 'A', permission: 'evidence-only', href: '/exchange/customer-A/views/V1/objects/T1' }],
    definition: { enum: 'E', version: 1 },
  });
  assert.equal(document.view, 'V1');
  assert.equal(document.relations[0].href, '/exchange/customer-A/views/V1/objects/T1');
  assert.equal(document.definition.version, '1');
  assert.throws(() => interpretRelations({ view: 'V1', relations: [{ target: 'T1', customer: 'A', permission: 'evidence-only' }], definition: { enum: 'E', version: '1' } }));
  assert.throws(() => interpretRelations({ view: 'V1', relations: [], definition: null }));
});

test('枚举定义版本或取值不相容时标注定义缺口', () => {
  const current = interpretDefinition({ enum: 'E', version: '2', values: [{ value: 'read-only-evidence', label: '只读证据' }] });
  assert.deepEqual(current.values, ['read-only-evidence']);
  const gap = checkDefinition('evidence-only', { enum: 'E', version: '1' }, current);
  assert.equal(gap.status, 'definition-gap');
  assert.equal(gap.declared, '1');
  assert.equal(gap.current, '2');
  assert.equal(gap.valueCurrent, false);
  assert.equal(checkDefinition('read-only-evidence', { enum: 'E', version: '2' }, current).status, 'compatible');
  assert.equal(checkDefinition('unknown', { enum: 'E', version: '2' }, current).reason, '取值不在当前枚举定义中');
  assert.equal(checkDefinition('evidence-only', { enum: 'E', version: '1' }, null).reason, '枚举定义不可用');
  assert.equal(checkDefinition('evidence-only', { enum: 'E', version: '1' }, interpretDefinition({ enum: 'F', version: '1', values: ['evidence-only'] })).reason, '枚举定义身份不符');
});
