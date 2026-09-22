/**
 * 启动时恢复登录态。
 *
 * 只在客户端跑（.client 后缀）：refresh token 存在浏览器的 cookie 里，
 * 服务端渲染时读不到；而且公开页面的 SSR 结果是「未登录」版本 ——
 * 这也是为什么页头里跟登录态有关的那块要用 <ClientOnly> 包起来，
 * 否则 hydration 时两边 DOM 不一致，Vue 会报 mismatch 并把这段整个替换掉。
 *
 * 这里用 top-level await：让应用等会话恢复完再挂载，避免已登录用户
 * 先看到「登录 / 注册」再闪成昵称。恢复失败不影响挂载 —— restore() 内部已捕获。
 */
export default defineNuxtPlugin(async () => {
  const auth = useAuth();
  await auth.restore();
});
