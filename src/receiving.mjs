export function assess(record, previous, scope) {
  if (record.customer !== scope) return { status: 'outside', reason: '客户身份不同' };
           if (!record.editable || record.type !== 'requirement') return { status: 'review', reason: '不是可编辑需求清单成员' };
           const prior = previous.find(item => item.object === record.object && item.text !== record.text);
           if (prior) return { status: 'conflict', reason: '同一次清单中对象内容冲突' };
           return { status: 'accepted', key: record.customer + ':' + record.object, facts: { object: record.object, heading: record.heading, customer: record.customer, editable: record.editable } };
}

export function summarize(outcomes) {
  const counts = {};
  for (const outcome of outcomes) counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
  return { complete: outcomes.length > 0 && outcomes.every(outcome => outcome.status === 'accepted'), counts, outcomes };
}
