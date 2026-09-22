/**
 * 前端产物冒烟测试：起 .output/server，逐个请求关键路由，打印状态码与体量。
 * 后端（localhost:3000）没有起来，所以前台数据接口会失败 ——
 * 这里要验证的正是「后端不可用时前端会不会崩」，而不是数据是否正确。
 */
const base = process.argv[2] || 'http://[::1]:3001';

const paths = [
  '/',
  '/about',
  '/archives',
  '/search',
  '/login',
  '/register',
  '/dashboard',
  '/dashboard/comments',
  '/dashboard/articles/new',
  '/admin',
  '/admin/users',
  '/admin/settings',
  '/categories/backend',
  '/tags/postgresql',
  '/articles/some-slug',
];

(async () => {
  for (const p of paths) {
    try {
      // 带上 Accept: text/html —— Nitro 对「浏览器来的请求」才渲染 Nuxt 错误页，
      // 否则只回一段 JSON。这里要验证的正是「错误页能不能正常渲染」
      const res = await fetch(base + p, {
        redirect: 'manual',
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      const body = await res.text();
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1] ?? '';
      const head = body.replace(/\s+/g, ' ').slice(0, 60);
      console.log(
        String(res.status).padEnd(4),
        String(body.length).padStart(7),
        p.padEnd(26),
        `title="${title}"`,
        head,
      );
    } catch (e) {
      console.log('ERR ', '        ', p.padEnd(26), e.message);
    }
  }
})();
