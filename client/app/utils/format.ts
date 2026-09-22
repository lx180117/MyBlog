/**
 * 日期、数字的展示格式化。全部是纯函数。
 *
 * 但注意 formatDate / formatDateTime / formatDateCn 依赖**执行环境的本地时区** ——
 * SSR 用的是容器里的时区，浏览器用的是访问者的时区。两边不一致时，同一篇文章的
 * 日期在服务端渲染出的 HTML 与 hydration 之后会不一样（Vue 报 mismatch，日期闪一下）。
 * 所以部署时必须给前端容器设 TZ，见 docker-compose.yml 的 client 服务。
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-09-18 */
export function formatDate(input?: string | Date | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 2026-09-18 16:20 */
export function formatDateTime(input?: string | Date | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 2026 年 9 月 18 日 */
export function formatDateCn(input?: string | Date | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/**
 * 相对时间。
 *
 * 注意：SSR 与客户端执行时刻不同，「刚刚 / 3 分钟前」这类结果会在 hydration 时
 * 对不上，Vue 会报 mismatch 警告。所以约定 —— 相对时间只在 onMounted 之后渲染，
 * 或者由调用方接受这一现象。列表里我统一用绝对日期，只有评论用相对时间。
 */
export function formatRelative(input?: string | Date | null, now = Date.now()): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (Number.isNaN(t)) return '';

  const diff = now - t;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (diff < 0) return formatDate(d);
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  return formatDate(d);
}

/** 1280 → 1.2k， 15680 → 1.6w（中文站用「万」比 k 更直觉） */
export function formatCount(n?: number | null): string {
  const v = n ?? 0;
  if (v < 1000) return String(v);
  if (v < 10_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(v / 10_000).toFixed(1).replace(/\.0$/, '')}w`;
}

/**
 * 中英混排的阅读时长估算。
 * 中文按 350 字/分钟，英文按 200 词/分钟，两者相加 —— 纯按字符数会把英文算得太长。
 */
export function estimateReadingMinutes(markdown?: string | null): number {
  if (!markdown) return 1;
  // 去掉代码块：读代码比读正文慢得多，但按字符算会严重高估
  const text = markdown.replace(/```[\s\S]*?```/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (text.match(/[A-Za-z]+/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 350 + words / 200));
}

/** 从 Markdown 里取第一张图，用作没填封面时的兜底 */
export function firstImage(markdown?: string | null): string | null {
  if (!markdown) return null;
  const m = /!\[[^\]]*\]\(([^)\s]+)/.exec(markdown);
  // m[1] 在 noUncheckedIndexedAccess 下是 string | undefined，用 ?? 归一到 null
  return m?.[1] ?? null;
}

/** 昵称取首字母/首字，做无头像时的字母头像 */
export function initialOf(name?: string | null): string {
  const s = (name ?? '').trim();
  const first = s.charAt(0); // 用 charAt 而不是 s[0]：后者在严格索引检查下是 string | undefined
  if (!first) return '?';
  return /[\u4e00-\u9fa5]/.test(first) ? first : first.toUpperCase();
}

/** 依据字符串稳定地派生一个色相，用于字母头像上色（同一个人颜色不变） */
export function hueOf(seed?: string | null): number {
  const s = seed ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
