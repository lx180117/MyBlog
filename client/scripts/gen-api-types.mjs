#!/usr/bin/env node
/**
 * 从后端产出的 openapi.json 生成前端 TypeScript 类型。
 *
 * 为什么自己写生成器而不用现成工具：
 *   openapi-typescript 会产出 `components['schemas']['ArticleListItemDto']` 这种
 *   索引访问类型 —— 类型安全但人读起来很痛苦。博客只有 58 个模型，生成一份
 *   **扁平、带注释、可直接 import** 的接口定义，维护成本更低。
 *
 * 用法：npm run gen:api
 * 输入：../server/openapi.json（由后端 `npm run openapi:export` 产出）
 * 输出：app/types/api.ts
 *
 * 约定：生成的内容**不要手改** —— 下次生成会被覆盖。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SPEC_PATH = resolve(ROOT, '../server/openapi.json');
const OUT_PATH = resolve(ROOT, 'app/types/api.ts');

if (!existsSync(SPEC_PATH)) {
  console.error(`[gen-api] 找不到 ${SPEC_PATH}`);
  console.error('[gen-api] 请先在 server/ 目录执行：npm run openapi:export');
  process.exit(1);
}

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const schemas = spec.components?.schemas ?? {};

/** 形如 { type: 'string', enum: [...] } 的纯枚举 schema：内联展开，不生成 alias */
const enumOnly = new Set(
  Object.entries(schemas)
    .filter(([, s]) => s.type === 'string' && Array.isArray(s.enum))
    .map(([name]) => name),
);

const refName = (ref) => ref.replace('#/components/schemas/', '');
const quote = (v) => (typeof v === 'string' ? `'${v}'` : String(v));
const sanitize = (s) => String(s ?? '').replace(/\r?\n/g, ' ').split('*/').join('*\\/').trim();

/**
 * 递归转 TS 类型表达式。
 * @param {any} node OpenAPI schema 片段
 * @param {number} depth 防深递归
 */
function toTs(node, depth = 0) {
  if (!node || depth > 12) return 'unknown';

  // $ref 指向纯枚举时直接内联，避免生成一堆只有一行的 alias
  if (node.$ref) {
    const name = refName(node.$ref);
    return enumOnly.has(name) ? toTs(schemas[name], depth + 1) : name;
  }

  if (Array.isArray(node.enum)) {
    if (node.enum.length === 1) return quote(node.enum[0]);
    return `(${node.enum.map(quote).join(' | ')})`;
  }

  // allOf 在本项目里只用来表达「引用 + 描述」，取第一个有实质内容的分支即可
  if (Array.isArray(node.allOf) && node.allOf.length) {
    const inner = node.allOf.map((b) => toTs(b, depth + 1)).filter((t) => t !== 'unknown');
    const uniq = [...new Set(inner)];
    if (uniq.length === 1) return uniq[0];
    return uniq.length ? `(${uniq.join(' & ')})` : 'unknown';
  }

  if (node.type === 'array') {
    const item = toTs(node.items ?? {}, depth + 1);
    // 联合类型数组必须加括号：('a'|'b')[]，否则会被解析成 'a' | ('b'[])
    return /[|&]/.test(item) && !item.startsWith('(') ? `(${item})[]` : `${item}[]`;
  }

  if (node.type === 'object' || node.properties) {
    const props = node.properties ?? {};
    if (!Object.keys(props).length) {
      const ap = node.additionalProperties;
      return ap && typeof ap === 'object'
        ? `Record<string, ${toTs(ap, depth + 1)}>`
        : 'Record<string, unknown>';
    }
    return 'object'; // 调用方保证这种节点不会走到这里
  }

  switch (node.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

/** 生成一个 interface 声明；没有 properties 时返回 null */
function emitInterface(name, schema) {
  const props = schema.properties;
  if (!props || !Object.keys(props).length) return null;

  const required = new Set(schema.required ?? []);
  const lines = [];

  for (const [key, raw] of Object.entries(props)) {
    const base = toTs(raw);
    const optional = !required.has(key);
    const nullable = raw.nullable === true;
    const finalType = nullable && base !== 'null' ? `${base} | null` : base;
    const keyPart = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`;

    const desc = sanitize(raw.description);
    if (desc) lines.push(`  /** ${desc} */`);
    lines.push(`  ${keyPart}${optional ? '?' : ''}: ${finalType};`);
  }

  const doc = sanitize(schema.description);
  const deprecated = schema.deprecated ? ' * @deprecated' : '';
  let head = '';
  if (doc || deprecated) {
    head = doc ? `/** ${doc}${deprecated ? '\n * @deprecated' : ''} */\n` : `/**\n${deprecated}\n */\n`;
  }

  return `${head}export interface ${name} {\n${lines.join('\n')}\n}`;
}

const chunks = [];
for (const name of Object.keys(schemas).sort()) {
  const schema = schemas[name];
  if (enumOnly.has(name)) {
    const doc = sanitize(schema.description) || name;
    chunks.push(`/** ${doc} */\nexport type ${name} = ${toTs(schema)};`);
    continue;
  }
  const iface = emitInterface(name, schema);
  if (iface) {
    chunks.push(iface);
  } else {
    const doc = sanitize(schema.description);
    const head = doc ? `/** ${doc} */\n` : '';
    chunks.push(`${head}export type ${name} = ${toTs(schema)};`);
  }
}

const header = `/* eslint-disable */
/**
 * ⚠️ 本文件由 \`npm run gen:api\` 自动生成，请勿手动修改。
 *
 * 来源：server/openapi.json（后端 \`npm run openapi:export\` 产出）
 * 契约：OpenAPI ${spec.openapi} — ${spec.info?.title ?? ''} v${spec.info?.version ?? ''}
 * 模型：${Object.keys(schemas).length} 个
 * 生成时间：${new Date().toISOString()}
 *
 * 改字段的唯一正确姿势：改后端 DTO → 重新导出 openapi.json → 重新生成本文件。
 */

`;

const body = header + chunks.join('\n\n') + '\n';
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, body, 'utf8');

console.log(`[gen-api] 已生成 ${OUT_PATH}`);
console.log(`[gen-api] 模型 ${Object.keys(schemas).length} 个，共 ${Buffer.byteLength(body, 'utf8')} 字节`);
