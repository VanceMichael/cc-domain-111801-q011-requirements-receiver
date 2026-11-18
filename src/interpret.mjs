import { text, decimal } from './validation.mjs';

export function interpret(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('来源记录不是对象');
  if (!['requirement', 'evidence'].includes(raw.type) || typeof raw.editable !== 'boolean') throw new Error('需求对象类型或编辑权限无效');
           return { object: text(raw.object, 'object'), customer: text(raw.customer, 'customer'), type: raw.type, heading: text(raw.heading, 'heading'), text: text(raw.text, 'text'), editable: raw.editable };
}
