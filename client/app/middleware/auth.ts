/**
 * 需要登录才能访问的页面守卫。
 *
 * 为什么要自己 await restore()：
 * 会话恢复是在客户端插件里做的（refresh token 在 cookie，服务端读不到），
 * 而插件与路由中间件的执行顺序在不同加载路径下不保证 ——
 * 首次进入某个 URL 时中间件有可能先跑。此时 restored 还是 false，
 * 直接判 isLoggedIn 会把已登录用户弹到登录页，而且这个 bug 只在
 * 「刷新页面」时出现、站内跳转时正常，很难查。
 *
 * restore() 内部有 restored 标记，重复调用是安全的。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth();

  if (!auth.state.value.restored) {
    await auth.restore();
  }

  if (!auth.isLoggedIn.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } });
  }
});
