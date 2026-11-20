import { text } from './validation.mjs';

export const collectionPath = "/exchange/customer-A";
export async function browse(client, path = collectionPath) {
  const document = await client.get(path);
  const raw = document.raw;
  const context = text(raw.customer, "customer");
  if (!Array.isArray(raw.objects)) throw new Error('来源目录结构无效');
  const references = raw.objects.map(entry => ({
    identity: text(entry.id, 'id'), href: text(entry.href, 'href'), context,
  }));
  if (new Set(references.map(entry => entry.identity)).size !== references.length) throw new Error('目录包含重复来源身份');
  return { context, references, path };
}
export async function retrieve(client, reference) {
  const document = await client.get(reference.href);
  if (document.raw.object !== reference.identity) throw new Error('原文身份与目录引用不符');
  if (document.raw.customer !== reference.context) throw new Error('原文上下文与目录不符');
  return document;
}
// 对象关系由独立授权查询入口提供；404 只表示未发布，调用方区分，不视为业务删除
export async function relations(client, identity, catalog = collectionPath) {
  return client.get(catalog + '/relations/' + encodeURIComponent(identity));
}
// 枚举定义由独立授权查询入口提供，按关系资料声明的定义身份取得
export async function definition(client, reference, catalog = collectionPath) {
  return client.get(catalog + '/definitions/' + encodeURIComponent(reference.enum));
}
