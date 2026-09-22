import type { UserProfileDto } from '~/types/api';

/**
 * 会话状态（不含任何网络请求，避免与 useApi 形成循环依赖）。
 *
 * 令牌存放策略 —— 这里有个刻意的取舍：
 *
 * - **Refresh Token 存 cookie**（非 httpOnly）：页面刷新后还能恢复会话。
 * - **Access Token 只放内存**（useState），不落任何持久存储。
 *
 * 为什么不两个都存 cookie：Access Token 一旦被写进 JS 可读的地方，
 * 一次 XSS 就能直接拿走并在 15 分钟内畅通无阻；只留内存的话，
 * 攻击者拿到的是「当前这一个标签页的临时凭证」，而 Refresh Token
 * 即使泄露也还需要再发一次刷新请求（那一步能被后台日志看到、可吊销）。
 *
 * 为什么不用 httpOnly：后端是标准的 `Authorization: Bearer` 契约，
 * 令牌必须由 JS 放进请求头。想让令牌彻底不碰 JS，需要在前端加一层
 * Nitro 代理（BFF）把 token 关在服务端 —— 那是一个更大的架构改动，
 * 对「≤20 位作者、自托管」的规模来说性价比不足，记在这里作为升级路径。
 */
export interface AuthSession {
  user: UserProfileDto | null;
  /** 账号已激活，可发布文章（对应后端 /auth/me 的 canPublish） */
  canPublish: boolean;
  /** 仅存内存，不持久化 */
  accessToken: string | null;
  refreshToken: string | null;
  /** 是否已尝试过「从 cookie 恢复会话」，避免重复触发 */
  restored: boolean;
}

const REFRESH_COOKIE = 'blog_rt';

/**
 * refreshToken 的 cookie 配置。7 天与后端 JWT_REFRESH_EXPIRES_IN 对齐。
 *
 * 为什么 `secure` 要跟随 `siteUrl` 的协议，而不是跟随构建模式（PROD）：
 *   cookie 的 `secure` 一旦打开，浏览器就**只在 HTTPS 下收发它**。
 *   但本项目支持内网/私有部署，那种形态下站点常常是 `http://内网IP` ——
 *   此时若还带着 secure，浏览器会**直接丢弃这个 cookie**（只在控制台留一句警告），
 *   表现为：refresh token 存不住 → 刷新页面就掉登录。
 *   （access token 只在内存里，本来就靠这个 cookie 恢复会话。）
 *
 * 用 `siteUrl` 判断的好处：它由 `SITE_URL` 一处派生（见 docker-compose.yml 的
 * `NUXT_PUBLIC_SITE_URL`），所以"站点是 http 还是 https"这个事实只配置在一个地方，
 * cookie 自动跟随，不会出现"两边各写一套、改了一处忘了另一处"。
 *
 * 注意：这里必须是函数而不是模块级常量 —— `useRuntimeConfig()` 需要 Nuxt 上下文，
 * 只能在 composable 被调用时求值。
 */
export function refreshCookieOptions() {
  const config = useRuntimeConfig();
  const isHttps = String(config.public.siteUrl || '').startsWith('https://');
  return {
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax' as const,
    secure: isHttps,
  };
}

export function useAuthState() {
  return useState<AuthSession>('auth-session', () => ({
    user: null,
    canPublish: false,
    accessToken: null,
    refreshToken: null,
    restored: false,
  }));
}

/** 写入令牌：access 进内存，refresh 同时落 cookie */
export function persistTokens(pair: { accessToken: string; refreshToken: string }): void {
  const state = useAuthState();
  state.value.accessToken = pair.accessToken;
  state.value.refreshToken = pair.refreshToken;
  const cookie = useCookie<string | null>(REFRESH_COOKIE, refreshCookieOptions());
  cookie.value = pair.refreshToken;
}

/** 清空会话（退出登录、令牌失效、账号被禁用时调用） */
export function clearSession(): void {
  const state = useAuthState();
  state.value.user = null;
  state.value.canPublish = false;
  state.value.accessToken = null;
  state.value.refreshToken = null;
  state.value.restored = true;
  const cookie = useCookie<string | null>(REFRESH_COOKIE, refreshCookieOptions());
  cookie.value = null;
}

/** 从 cookie 读回 refresh token（页面加载时用一次） */
export function readRefreshToken(): string | null {
  const state = useAuthState();
  if (state.value.refreshToken) return state.value.refreshToken;
  const cookie = useCookie<string | null>(REFRESH_COOKIE, refreshCookieOptions());
  state.value.refreshToken = cookie.value ?? null;
  return state.value.refreshToken;
}
