#!/usr/bin/env node
/**
 * sitemap.xml / rss.xml 的链接连通性校验。
 *
 * 为什么值得单独做这个检查：这两个文件由后端拼字符串生成，里面的 URL 指向**前端路由**。
 * 两边一旦不一致，后果是「爬虫收录一片 404、RSS 读者点开是空页」，而且极其隐蔽 ——
 * 类型检查、OpenAPI 导出、前端契约校验全都不会报错。
 *
 * 真实发生过：后端写的是单数 `/article/{slug}`、`/category/{slug}`、`/tag/{slug}`，
 * 而前端的页面目录是复数 `articles`、`categories`、`tags`，于是 sitemap 里除首页和
 * 归档之外每一条都是死链。2026-09-18 端到端验证时才通过「把每个 <loc> 真的请求一遍」抓出来。
 *
 * 用法：
 *   node scripts/check-feed-links.mjs
 *   BACKEND=http://127.0.0.1:3000 FRONT=http://127.0.0.1:3001 node scripts/check-feed-links.mjs
 *
 * 前置：后端与前端都已启动。
 * 退出码：全部可达 0，有死链 1。
 */

const BACKEND = (process.env.BACKEND || 'http://127.0.0.1:3000').replace(/\/$/, '');
const FRONT = (process.env.FRONT || 'http://127.0.0.1:3001').replace(/\/$/, '');

/** sitemap 里的地址是对外地址（SITE_BASE_URL），探测时换成实际的前端地址 */
const toFront = (url) => url.replace(/^https?:\/\/[^/]+/, FRONT);
const pathOf = (url) => decodeURIComponent(url.replace(/^https?:\/\/[^/]+/, ''));

let failed = 0;
let checked = 0;

async function probe(label, url) {
  checked += 1;
  let status = 'ERR';
  try {
    const res = await fetch(toFront(url), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    status = res.status;
  } catch (err) {
    status = `异常(${err.name})`;
  }
  const bad = status !== 200;
  if (bad) failed += 1;
  console.log(`  ${bad ? '✗' : '✓'} ${status}  ${pathOf(url)}`);
  void label;
}

const sitemapRes = await fetch(`${BACKEND}/sitemap.xml`, { signal: AbortSignal.timeout(15_000) });
const sitemap = await sitemapRes.text();
const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
console.log(`sitemap.xml: HTTP ${sitemapRes.status}，共 ${locs.length} 条 URL`);
for (const loc of locs) await probe('sitemap', loc);

const rssRes = await fetch(`${BACKEND}/rss.xml`, { signal: AbortSignal.timeout(15_000) });
const rss = await rssRes.text();
// channel 自身也有一条 <link>，只关心指向文章的
const links = [...rss.matchAll(/<link>(.*?)<\/link>/g)].map((m) => m[1]).filter((l) => /\/articles?\//.test(l));
console.log(`\nrss.xml: HTTP ${rssRes.status}，文章链接 ${links.length} 条`);
for (const link of links) await probe('rss', link);

console.log(
  `\n${failed === 0 ? `✅ 全部 ${checked} 条链接均可用` : `❌ ${checked} 条里有 ${failed} 条不可达`}`,
);
process.exit(failed === 0 ? 0 : 1);
