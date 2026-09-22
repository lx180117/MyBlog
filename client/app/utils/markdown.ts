import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

/**
 * 编辑器实时预览用的 Markdown 渲染。
 *
 * 两个刻意的选择：
 *
 * ① **用 marked，不用 markdown-it。**
 *   后端 renderMarkdown 用的是 marked（`gfm: true, breaks: false`）。
 *   预览如果用另一个解析器，同一份 Markdown 在预览里和发布后会长得不一样 ——
 *   表格断行、任务列表样式、软换行处理的细节差异都会露出来。
 *   「所见即所得」的前提是解析器同源，所以这里跟后端保持一致而不是另选一个更"流行"的。
 *
 * ② **仍在客户端再净化一次。**
 *   内容最终落库前，后端会用 sanitize-html 白名单过滤并缓存成 contentHtml，
 *   那才是防 XSS 的主防线。这里的净化只针对预览：预览是直接插进当前浏览器 DOM 的，
 *   作者（或任何拿到该账号的人）在正文里写 <img onerror=...> 会在**自己**的会话里执行，
 *   属于 self-XSS —— 危害有限，但顺手挡掉比留着强，成本也就一个函数调用。
 */

marked.setOptions({
  gfm: true, // 表格、任务列表、删除线
  breaks: false, // 与后端一致：单个换行不产生 <br>
});

let rendererInstalled = false;

function installRenderer() {
  if (rendererInstalled) return;
  rendererInstalled = true;

  const renderer = new marked.Renderer();

  // marked 在 v5 之后把 renderer 的入参从 (code, lang) 改成了 token 对象。
  // 这里两种签名都兼容 —— 版本升级不该让预览直接崩掉。
  renderer.code = (token: unknown, maybeLang?: string) => {
    const isToken = typeof token === 'object' && token !== null;
    const code = isToken ? String((token as { text?: string }).text ?? '') : String(token ?? '');
    const rawLang = isToken
      ? String((token as { lang?: string }).lang ?? '')
      : String(maybeLang ?? '');

    const lang = rawLang.trim().split(/\s+/)[0];
    let html: string;
    let cls = 'hljs';

    if (lang && hljs.getLanguage(lang)) {
      html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      cls = `hljs language-${lang}`;
    } else {
      // 没写语言就自动识别。识别不出来的短片段会落到 plaintext，
      // 此时 escape 掉尖括号即可，不调 hljs（它会乱着色）
      try {
        const auto = hljs.highlightAuto(code);
        html = auto.value;
        cls = 'hljs';
      } catch {
        html = escapeHtml(code);
      }
    }

    const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
    return `<pre class="code-block">${label}<code class="${cls}">${html}</code></pre>`;
  };

  marked.use({ renderer });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 预览用的 DOMPurify 配置。
 * 允许的标签与后端 ALLOWED_TAGS 基本对齐 —— 预览里能出现的东西，
 * 发布后也该能出现；预览里被拦掉的东西，发布后也会被后端拦掉。
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sup', 'sub',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'a', 'img', 'figure', 'figcaption', 'span', 'div',
    'input',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'loading',
    'class', 'id', 'align', 'colspan', 'rowspan', 'type', 'checked', 'disabled',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

/** Markdown → 可安全插入的 HTML（仅用于编辑器预览） */
export function renderPreview(markdown: string): string {
  if (!markdown) return '';
  installRenderer();
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw, PURIFY_CONFIG);
}

/** 统计正文字数（中文字符 + 英文单词），编辑器的字数提示用 */
export function countWords(markdown: string): { chars: number; words: number } {
  const text = (markdown || '').replace(/```[\s\S]*?```/g, ' ');
  return {
    chars: text.replace(/\s/g, '').length,
    words: (text.match(/[A-Za-z]+/g) ?? []).length,
  };
}
