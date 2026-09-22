import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Markdown → 安全 HTML
 *
 * 安全要点（需求 NFR：Markdown 渲染结果转义防 XSS）：
 *  - Markdown 本身允许内联 HTML 语法，如果原样输出，作者（或被提权的账号）
 *    就能在文章里插入 <script>，攻击所有读者。这里用 sanitize-html 白名单过滤，
 *    **方案是白名单而非黑名单** —— 黑名单永远漏。
 *  - 危险协议 javascript:/data: 在 allowedSchemes 里被限制为仅 http/https/mailto。
 *  - 代码高亮的 class 保留在 code/pre 上，前端再交给 highlight.js 着色；
 *    服务端不做高亮，避免引入 jsdom（体积大、每次请求都跑不划算）。
 */

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'blockquote', 'pre', 'code',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sup', 'sub',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'img', 'figure', 'figcaption', 'span', 'div',
  'input', // 任务列表的复选框，会被限制为 disabled
];

marked.setOptions({
  gfm: true, // GitHub 风格：表格、任务列表、删除线
  breaks: false,
});

/** 渲染并净化 Markdown 正文。返回可直接注入到页面的 HTML 字符串 */
export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown || '', { async: false }) as string;

  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      code: ['class'], // language-xxx 交给前端高亮
      pre: ['class'],
      span: ['class'],
      div: ['class'],
      th: ['align', 'colspan', 'rowspan'],
      td: ['align', 'colspan', 'rowspan'],
      input: ['type', 'checked', 'disabled'],
      '*': ['id'], // 目录锚点需要 id（h2/h3 的 id 由前端或扩展生成）
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] }, // 禁止 data: 图片，防止 SVG 携带脚本
    allowProtocolRelative: false,
    transformTags: {
      // 外链一律新窗口打开，并加 rel 防止 tabnabbing
      a: (tagName, attribs) => {
        const href = attribs.href || '';
        const isExternal = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: isExternal
            ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
            : attribs,
        };
      },
      // 图片强制懒加载，长文首屏更快
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
    },
    disallowedTagsMode: 'discard',
  });
}

/**
 * 提取 Markdown 中的标题，生成文章目录（TOC）。
 * 前端拿到结构后自行渲染侧边栏；服务端算一次比前端解析全文更省。
 */
export interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

export function extractToc(markdown: string): TocItem[] {
  const lines = (markdown || '').split('\n');
  const items: TocItem[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{2,4})\s+(.+?)\s*$/.exec(line); // 只收 h2~h4，h1 是标题本身
    if (match) {
      const text = match[2].replace(/[*_`~]/g, '').trim();
      items.push({
        level: match[1].length,
        text,
        anchor: slugifyForAnchor(text),
      });
    }
  }
  return items;
}

/** 目录锚点：与前端渲染时给标题加 id 的规则必须一致，否则点击跳转失效 */
export function slugifyForAnchor(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}
