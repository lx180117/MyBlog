import type {
  CurrentUserResponseDto,
  LoginResponseDto,
  RegisterResponseDto,
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  UserProfileDto,
} from '~/types/api';
import { persistTokens, clearSession, useAuthState } from './useAuthState';

/**
 * 登录态与账号相关操作。
 *
 * 状态本身放在 useAuthState（useState，SSR 安全），这里只包一层业务方法，
 * 免得每个组件各自去调 API 再自己 setState —— 那样很容易出现
 * 「个人资料改了但页头昵称没变」这类不一致。
 */
export function useAuth() {
  const api = useApi();
  const state = useAuthState();

  const isLoggedIn = computed(() => Boolean(state.value.user));
  const isAdmin = computed(() => state.value.user?.role === 'admin');
  const canPublish = computed(() => state.value.canPublish);
  /** 账号待审核：能登录、能改资料，但不能发文 */
  const isPending = computed(() => state.value.user?.status === 'pending');
  const isDisabled = computed(() => state.value.user?.status === 'disabled');

  /** 用当前令牌拉取用户资料。失败（401/403）会清空会话并返回 false */
  async function fetchMe(): Promise<boolean> {
    if (!state.value.accessToken) return false;
    try {
      const res = await api.get<CurrentUserResponseDto>('/auth/me');
      state.value.user = res.user;
      state.value.canPublish = res.canPublish;
      return true;
    } catch (e) {
      const err = e as { statusCode?: number };
      // 401 说明令牌彻底失效；403 说明账号被禁用 —— 两种都该退出
      if (err.statusCode === 401 || err.statusCode === 403) {
        clearSession();
      }
      return false;
    }
  }

  /**
   * 页面加载时恢复会话。
   * refresh token 在 cookie 里，换回一个内存中的 access token，再拉资料。
   */
  async function restore(): Promise<void> {
    if (state.value.restored) return;
    if (state.value.accessToken) {
      await fetchMe();
      state.value.restored = true;
      return;
    }
    const ok = await api.ensureFreshToken();
    if (ok) await fetchMe();
    state.value.restored = true;
  }

  async function login(dto: LoginDto): Promise<UserProfileDto> {
    const res = await api.post<LoginResponseDto>('/auth/login', dto, { anonymous: true });
    persistTokens(res.tokens);
    state.value.user = res.user;
    state.value.canPublish = res.user.status === 'active';
    state.value.restored = true;
    return res.user;
  }

  async function register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const res = await api.post<RegisterResponseDto>('/auth/register', dto, { anonymous: true });
    persistTokens(res.data.tokens);
    state.value.user = res.data.user;
    state.value.canPublish = res.data.user.status === 'active';
    state.value.restored = true;
    return res;
  }

  async function logout(): Promise<void> {
    const token = state.value.refreshToken;
    try {
      // 通知后端吊销 refresh token。失败也要继续清本地状态 ——
      // 用户点了「退出」，界面上就必须真的退出，不能因为网络问题把人留着
      if (token) await api.post('/auth/logout', { refreshToken: token });
    } catch {
      /* 忽略 */
    } finally {
      clearSession();
    }
  }

  async function updateProfile(dto: UpdateProfileDto): Promise<UserProfileDto> {
    const user = await api.patch<UserProfileDto>('/auth/me', dto);
    state.value.user = user;
    return user;
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/me/password', { oldPassword, newPassword });
  }

  return {
    state,
    isLoggedIn,
    isAdmin,
    isPending,
    isDisabled,
    canPublish,
    restore,
    fetchMe,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
  };
}
