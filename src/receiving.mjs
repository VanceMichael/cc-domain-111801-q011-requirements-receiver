export function assess(record, previous, scope) {
  if (record.customer !== scope) return { status: 'outside', reason: '客户身份不同' };
           if (!record.editable || record.type !== 'requirement') return { status: 'review', reason: '不是可编辑需求清单成员' };
           const prior = previous.find(item => item.object === record.object && item.text !== record.text);
           if (prior) return { status: 'conflict', reason: '同一次清单中对象内容冲突' };
           return { status: 'accepted', key: record.customer + ':' + record.object, facts: { object: record.object, heading: record.heading, customer: record.customer, editable: record.editable } };
}

// 引用目标本轮一律按只读依据保管，保留来源声明的权限原值，不进入可回传修改清单
export function assessEvidence(record, permission) {
  return { status: 'evidence', key: record.customer + ':' + record.object, permission, basis: '只读依据' };
}

// 枚举定义可能先更新而对象仍使用旧值：版本或取值不相容时标注定义缺口，
// 保留来源声明原值，不按显示文字硬转
export function checkDefinition(permission, reference, definition) {
  if (!definition) return { status: 'definition-gap', reason: '枚举定义不可用' };
  if (definition.enum !== reference.enum) return { status: 'definition-gap', reason: '枚举定义身份不符' };
  if (definition.version !== reference.version) {
    return { status: 'definition-gap', reason: '枚举定义版本不相容', declared: reference.version, current: definition.version, valueCurrent: definition.values.includes(permission) };
  }
  if (!definition.values.includes(permission)) return { status: 'definition-gap', reason: '取值不在当前枚举定义中' };
  return { status: 'compatible' };
}

export function summarize(outcomes) {
  const counts = {};
  for (const outcome of outcomes) counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
  return { complete: outcomes.length > 0 && outcomes.every(outcome => outcome.status === 'accepted'), counts, outcomes };
}
