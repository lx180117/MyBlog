import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-09-18',

  // ---------------------------------------------------------------- 模块
  modules: ['@nuxtjs/color-mode', '@element-plus/nuxt'],

  // 暗黑模式用 class 策略（而不是 media），这样才能「跟随系统 + 手动切换」两者共存
  colorMode: {
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    storageKey: 'blog-color-mode',
  },

  // Element Plus 只在后台用。
  //
  // importStyle 设为 false 是刻意的：默认的 'css' 会把 element-plus/dist/index.css
  // 打进**全站**公共样式，前台读者也要下载一份后台才用的 CSS（约 45KB gzip）。
  // 改成手动在 layouts/console.vue 里 import，Vite 会把它切进后台那几个路由的
  // 异步 chunk，前台页面完全不加载。
  elementPlus: {
    importStyle: false,
    themes: [],
    // Element Plus 默认语言是英语：分页会显示 "Go to"、日期选择器是英文月份、
    // 确认弹窗按钮是 OK/Cancel。站点是中文的，这里必须改掉。
    // 这一项由模块在编译期把 element-plus 内部的 locale 引用换成 zh-cn。
    defaultLocale: 'zh-cn',
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  // ---------------------------------------------------------------- 渲染策略
  routeRules: {
    // 需要登录的界面关掉 SSR：
    // 这些页面首屏必须带用户态，SSR 时 token 在浏览器 cookie 里、服务端拿不到，
    // 硬做 SSR 只会渲染出「未登录」再被客户端覆盖 —— 白闪一次，还容易读到错误的权限分支。
    '/dashboard/**': { ssr: false },
    '/admin/**': { ssr: false },
    '/login': { ssr: false },
    '/register': { ssr: false },
  },

  runtimeConfig: {
    /**
     * SSR 侧专用的 API 根地址（**私有**，不会下发到浏览器）。
     *
     * 为什么需要它：浏览器与 SSR 对「API 在哪」的答案不一样。
     *  - 浏览器：生产环境应走**同源相对路径** `/api/v1`（由 Nginx 转发）。
     *    好处是不需要 CORS、不把域名/端口写死进构建产物 —— 换域名不用重新构建。
     *  - SSR：跑在 Node 里，`$fetch` **无法解析相对路径**（会抛 Failed to parse URL），
     *    必须给绝对地址。容器内直接用内网服务名，不经公网回环，快且不依赖 DNS 解析自己的域名。
     *
     * 生产用环境变量覆盖：`NUXT_API_BASE_SERVER=http://api:3000/api/v1`
     */
    apiBaseServer: 'http://127.0.0.1:3000/api/v1',

    public: {
      /** 后端 API 根地址（含 /api/v1 前缀）；生产环境应为同源 `/api/v1` */
      apiBase: 'http://localhost:3000/api/v1',
      /** 站点对外地址，用于生成 canonical / og:url / 分享链接 */
      siteUrl: 'http://localhost:3001',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  nitro: {
    compressPublicAssets: true,
  },

  experimental: {
    // 首屏 payload 只带当前页面需要的数据
    payloadExtraction: true,
  },
});
