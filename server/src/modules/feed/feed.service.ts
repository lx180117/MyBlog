import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * 前台路由路径。
 *
 * 这里必须与 `client/app/pages` 下的实际目录名一致。之前后端与前端各写各的：
 * 后端用了单数（`/article`、`/category`、`/tag`），前端的页面目录却是复数
 * （`articles`、`categories`、`tags`），于是 sitemap.xml 与 rss.xml 里除了首页和归档，
 * **每一条链接都指向 404** —— 爬虫收录死链、RSS 读者点开是空页，而且不报任何错。
 * 这个不一致在类型检查、OpenAPI 导出、前端契约校验里都看不出来，只有把前端跑起来
 * 抓一次 sitemap 对照真实路由才会暴露（2026-09-18 端到端验证时发现并修复）。
 * 所以收敛成一处常量，避免再次各写各的。
 */
const FRONT_ROUTES = {
  article: (slug: string) => `/articles/${encodeURIComponent(slug)}`,
  category: (slug: string) => `/categories/${encodeURIComponent(slug)}`,
  tag: (slug: string) => `/tags/${encodeURIComponent(slug)}`,
  author: (username: string) => `/author/${encodeURIComponent(username)}`,
} as const;

/**
 * 站点地图与 RSS。
 *
 * 为什么放在后端而不是让前端 SSR 生成：
 *  1. 这两个文件是**给爬虫和阅读器**看的，走一次数据库 + 字符串拼接即可，不需要 Vue 渲染；
 *  2. Nginx 可以直接把 `/sitemap.xml`、`/rss.xml` 反代到后端并加长缓存，比让 Nuxt 处理更省资源；
 *  3. 前端是 SSR，如果爬虫请求触发了前端渲染，反而容易因为首屏超时拿不到内容。
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private get siteBaseUrl(): string {
    return (process.env.SITE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  /** sitemap.xml：首页、分类页、标签页、作者主页、全部已发布文章 */
  async buildSitemap(): Promise<string> {
    const now = new Date();
    const base = this.siteBaseUrl;

    const [articles, categories, tags, authors] = await Promise.all([
      this.prisma.article.findMany({
        where: { status: 'published', publishedAt: { lte: now } },
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: 5000, // 单站规模上限 1000 篇，这里给足余量
      }),
      this.prisma.category.findMany({ select: { slug: true, updatedAt: true } }),
      this.prisma.tag.findMany({ select: { slug: true } }),
      this.prisma.user.findMany({
        where: { status: 'active', articles: { some: { status: 'published', publishedAt: { lte: now } } } },
        select: { username: true, updatedAt: true },
      }),
    ]);

    const urls: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [
      { loc: `${base}/`, lastmod: now.toISOString(), changefreq: 'daily', priority: '1.0' },
      { loc: `${base}/archives`, changefreq: 'weekly', priority: '0.6' },
    ];

    for (const a of articles) {
      urls.push({
        loc: `${base}${FRONT_ROUTES.article(a.slug)}`,
        lastmod: a.updatedAt.toISOString(),
        changefreq: 'monthly',
        priority: '0.8',
      });
    }
    for (const c of categories) {
      urls.push({
        loc: `${base}${FRONT_ROUTES.category(c.slug)}`,
        lastmod: c.updatedAt.toISOString(),
        changefreq: 'weekly',
        priority: '0.5',
      });
    }
    for (const t of tags) {
      urls.push({ loc: `${base}${FRONT_ROUTES.tag(t.slug)}`, changefreq: 'weekly', priority: '0.4' });
    }
    for (const u of authors) {
      urls.push({
        loc: `${base}${FRONT_ROUTES.author(u.username)}`,
        lastmod: u.updatedAt.toISOString(),
        changefreq: 'weekly',
        priority: '0.6',
      });
    }

    const body = urls
      .map(
        (u) =>
          `  <url>\n    <loc>${escapeXml(u.loc)}</loc>` +
          (u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '') +
          `\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
  }

  /** robots.txt：允许抓取全站，但把后台与 API 排除掉，避免浪费爬虫预算 */
  async buildRobots(): Promise<string> {
    const base = this.siteBaseUrl;
    return [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/',
      'Disallow: /drafts',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ].join('\n');
  }

  /** RSS 2.0 */
  async buildRss(limit = 20): Promise<string> {
    const now = new Date();
    const [siteName, description] = await Promise.all([
      this.settings.get('site_name', '我的博客'),
      this.settings.get('site_description', ''),
    ]);

    const articles = await this.prisma.article.findMany({
      where: { status: 'published', publishedAt: { lte: now } },
      select: {
        title: true,
        slug: true,
        summary: true,
        contentHtml: true,
        publishedAt: true,
        author: { select: { nickname: true, username: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });

    const base = this.siteBaseUrl;
    const items = articles
      .map((a) => {
        const link = `${base}${FRONT_ROUTES.article(a.slug)}`;
        return [
          '    <item>',
          `      <title>${escapeXml(a.title)}</title>`,
          `      <link>${escapeXml(link)}</link>`,
          `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
          `      <pubDate>${(a.publishedAt ?? now).toUTCString()}</pubDate>`,
          `      <author>${escapeXml(a.author.nickname)}</author>`,
          `      <description>${escapeXml(a.summary ?? '')}</description>`,
          // 正文塞进 CDATA，避免 HTML 里的 & < > 破坏 XML 结构。
          // 注意把 ]]> 拆开，否则正文里出现这个序列会直接把文档截断
          `      <content:encoded><![CDATA[${(a.contentHtml ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></content:encoded>`,
          '    </item>',
        ].join('\n');
      })
      .join('\n');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${escapeXml(siteName)}</title>`,
      `    <link>${escapeXml(base)}</link>`,
      `    <description>${escapeXml(description)}</description>`,
      '    <language>zh-CN</language>',
      `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
      `    <atom:link href="${escapeXml(`${base}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
      items,
      '  </channel>',
      '</rss>',
    ].join('\n');
  }
}

/** XML 特殊字符转义。少转一个 & 就会让整个订阅源解析失败 */
function escapeXml(input: string): string {
  return (input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
