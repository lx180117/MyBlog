/**
 * 把任意标题转成 URL 友好的 slug。
 *
 * 设计取舍：
 *  - 中文**保留原字**（`/articles/数据库设计`），不做拼音转换 —— 拼音需要额外词典
 *    且会产生大量重名；中文路径在主流浏览器与搜索引擎里工作正常。
 *  - 只做保留字剔除、空白折叠、全角转半角、大小写统一。
 *  - 数据库对 articles.slug 有 UNIQUE 约束，重名由调用方用 `uniqueSlug()` 兜底。
 */
export function slugify(input: string, maxLength = 80): string {
  const base = (input || '')
    .normalize('NFKC') // 全角 → 半角
    .trim()
    .toLowerCase()
    // 允许：中日韩文字、字母、数字、空格、连字符、下划线
    .replace(/[^\u4e00-\u9fa5\u3040-\u30ffa-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!base) return '';
  return base.length > maxLength ? base.slice(0, maxLength).replace(/-$/, '') : base;
}

/**
 * 用户名列专用：数据库 CHECK 约束要求 `^[a-z0-9][a-z0-9_-]{2,49}$`。
 * 与 slugify 不同，这里**不允许中文**，因为用户名要同时出现在 URL 与登录框里。
 */
export function normalizeUsername(input: string): string {
  return (input || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[-_]+/, '')
    .slice(0, 50);
}

/**
 * 生成不重复的 slug。
 * @param desired  期望的 slug
 * @param exists   判断是否已存在的函数（返回 true 表示被占用）
 * @param ignoreId 更新场景下忽略自身
 */
export async function uniqueSlug(
  desired: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let candidate = desired;
  let seq = 1;
  // 上限 50 次：正常业务不会撞这么多次，超出说明 exists 实现有问题
  while (seq <= 50 && (await exists(candidate))) {
    seq += 1;
    candidate = `${desired}-${seq}`;
  }
  return candidate;
}

/** 从 Markdown 正文截取纯文本摘要（去掉标记符号、代码块、图片） */
export function extractSummary(markdown: string, length = 200): string {
  const text = (markdown || '')
    .replace(/```[\s\S]*?```/g, ' ') // 代码块
    .replace(/`[^`]*`/g, ' ') // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/^#{1,6}\s+/gm, '') // 标题井号
    .replace(/^>\s?/gm, '') // 引用
    .replace(/^\s*[-*+]\s+/gm, '') // 列表符号
    .replace(/[*_~]/g, '') // 强调符号
    .replace(/<[^>]+>/g, ' ') // 残留 HTML
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/** 便于阅读的“文件大小”格式化，用于上传返回信息 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 占位导出，避免打包器把上面的工具函数摇树掉（供未来扩展） */
export const slugUtils = { slugify, normalizeUsername, uniqueSlug, extractSummary, formatBytes };
