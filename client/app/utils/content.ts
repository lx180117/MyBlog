import hljs from 'highlight.js/lib/common';

/**
 * 文章正文的「DOM 后处理」。
 *
 * 为什么需要这一步 —— 后端 renderMarkdown 的交接口有两处是留给前端的
 * （见 server/src/common/utils/markdown.util.ts 的注释）：
 *
 *   1. **代码高亮不做**，只保留 `<code class="language-xxx">`，注释原文：
 *      「前端再交给 highlight.js 着色；服务端不做高亮，避免引入 jsdom」。
 *   2. **标题的 id 不生成**，而 `toc[].anchor` 又需要用来做锚点跳转。
 *
 * 这两件事必须在 DOM 就绪后跑，所以放在 onMounted 里，并且要能重复执行
 * （登录状态变化会重新拉取文章 → 内容被替换 → 后处理得重来）。
 */

/** 与后端 extractToc 里的 slugifyForAnchor **逐字一致**，否则锚点对不上 */
export function slugifyForAnchor(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

const HEADING_SELECTOR = 'h2, h3, h4';

/**
 * 给正文标题补 id，并跑代码高亮。
 *
 * 关于 id 的取法 —— 这里有个坑值得说明：
 * 后端 TOC 的 `anchor` 是从 **Markdown 源文本**算出来的（去掉 `* _ ` ~ ` 后走 slug 规则），
 * 而 DOM 里能拿到的是**渲染后的纯文本**。两者在多数情况下一致，但遇到
 * `## [标题](url)` 这种带链接的标题就会分叉（源文本含 `[` `]` `(` `)`，纯文本不含）。
 *
 * 所以我不用「文本 → 算 id」去对齐，而是**按文档顺序配对**：
 * 正文里的 h2–h4 与 TOC 数组天然同序（后端 extractToc 也是顺序扫描、只收 h2–h4），
 * 于是第 i 个标题直接采用 toc[i].anchor。
 * 这样标题里写什么都不会错位 —— 契约以 TOC 为准，而不是靠两边各算一次能算得一样。
 */
export function hydrateArticleDom(
  root: HTMLElement | null | undefined,
  anchors?: string[] | null,
): void {
  if (!root) return;

  const headings = Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
  headings.forEach((el, i) => {
    const id = anchors?.[i] ?? slugifyForAnchor(el.textContent ?? '');
    if (!id) return;
    el.id = id;

    // 悬停时才出现的 # 锚点链接，方便复制分享
    if (el.querySelector(':scope > .heading-anchor')) return;
    const a = document.createElement('a');
    a.className = 'heading-anchor';
    a.href = `#${id}`;
    a.setAttribute('aria-label', '本节链接');
    a.textContent = '#';
    el.appendChild(a);
  });

  highlightCode(root);
}

/** 高亮所有未处理过的代码块。重复调用是安全的。 */
export function highlightCode(root: HTMLElement): void {
  const blocks = root.querySelectorAll<HTMLElement>('pre code');
  blocks.forEach((el) => {
    if (el.dataset.hl === '1') return;
    // 语言标记可能缺失（作者没写 ```lang），此时走自动识别；
    // 识别结果不可靠的短片段用 plaintext 更安全，但 hljs 会自动兜底
    try {
      hljs.highlightElement(el);
    } catch {
      /* 高亮失败不该让整篇文章渲染不出来，忽略 */
    }
    el.dataset.hl = '1';
  });
}

/** 从 contentHtml 收集标题锚点，便于 TOC 高亮当前阅读位置 */
export function collectHeadingOffsets(root: HTMLElement | null | undefined) {
  if (!root) return [] as { id: string; top: number }[];
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .filter((el) => el.id)
    .map((el) => ({ id: el.id, top: el.offsetTop }));
}
