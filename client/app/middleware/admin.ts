/**
 * 管理员守卫。非管理员不要弹到登录页 —— 他已经登录了，
 * 弹登录页会让人以为掉线了。直接送回工作台并提示无权限更清楚。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth();

  if (!auth.state.value.restored) {
    await auth.restore();
  }

  if (!auth.isLoggedIn.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } });
  }

  if (!auth.isAdmin.value) {
    return navigateTo('/dashboard');
  }
});
