import { text, decimal } from './validation.mjs';

export function interpret(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('来源记录不是对象');
  if (!['requirement', 'evidence'].includes(raw.type) || typeof raw.editable !== 'boolean') throw new Error('需求对象类型或编辑权限无效');
           return { object: text(raw.object, 'object'), customer: text(raw.customer, 'customer'), type: raw.type, heading: text(raw.heading, 'heading'), text: text(raw.text, 'text'), editable: raw.editable };
}

function version(value, name) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value, name);
}

export function interpretRelations(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('对象关系资料不是对象');
  if (!Array.isArray(raw.relations)) throw new Error('对象关系资料结构无效');
  if (!raw.definition || typeof raw.definition !== 'object' || Array.isArray(raw.definition)) throw new Error('对象关系缺少枚举定义引用');
  const relations = raw.relations.map(entry => ({
    target: text(entry.target, 'target'), customer: text(entry.customer, 'customer'),
    permission: text(entry.permission, 'permission'), href: text(entry.href, 'href'),
  }));
  const targets = relations.map(entry => entry.customer + ':' + entry.target);
  if (new Set(targets).size !== targets.length) throw new Error('对象关系包含重复目标');
  return {
    view: text(raw.view, 'view'), relations,
    definition: { enum: text(raw.definition.enum, 'enum'), version: version(raw.definition.version, 'version') },
  };
}

export function interpretDefinition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('枚举定义不是对象');
  if (!Array.isArray(raw.values)) throw new Error('枚举定义结构无效');
  // 只按取值身份核对，显示文字 label 不参与解释转换
  const values = raw.values.map(entry => typeof entry === 'string' ? text(entry, 'value') : text(entry.value, 'value'));
  if (new Set(values).size !== values.length) throw new Error('枚举定义包含重复取值');
  return { enum: text(raw.enum, 'enum'), version: version(raw.version, 'version'), values };
}
