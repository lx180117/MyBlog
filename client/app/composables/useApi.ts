import type { ErrorResponseDto } from '~/types/api';
import { clearSession, persistTokens, readRefreshToken, useAuthState } from './useAuthState';

/**
 * 统一的 API 调用层。
 *
 * 职责：
 *   1. 拼接 baseURL、自动带 `Authorization: Bearer`
 *   2. 401 时**自动用 refresh token 换新令牌并重放原请求**，调用方无感
 *   3. 把后端的错误响应压成 ApiError，带可直接展示的中文 message
 */

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly path?: string;

  constructor(statusCode: number, message: string, errorCode = '', path?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.path = path;
  }

  get isUnauthorized() {
    return this.statusCode === 401;
  }
  get isForbidden() {
    return this.statusCode === 403;
  }
  get isNotFound() {
    return this.statusCode === 404;
  }
}

type QueryValue = string | number | boolean | undefined | null | (string | number)[];

export interface RequestOptions {
  /** 查询参数；undefined / null / 空字符串会被丢弃 */
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  /** 跳过 401 自动刷新（刷新接口自身要用，避免递归） */
  skipAuthRefresh?: boolean;
  /** 不带 Authorization 头 */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/**
 * 同一时刻只允许有一次刷新在飞。
 *
 * 页面首屏可能并发发出 5～6 个请求，令牌过期时它们会**同时**收到 401。
 * 如果各自去换令牌，后到的几个会因为「refresh token 已被消费」而失败，
 * 用户就会莫名其妙被踢下线。所以把第一个刷新请求的 Promise 存下来共享。
 */
let inflightRefresh: Promise<boolean> | null = null;

export function useApi() {
  const config = useRuntimeConfig();

  /**
   * 浏览器与 SSR 用不同的 baseURL。
   *
   * 生产环境下 `config.public.apiBase` 是**同源相对路径** `/api/v1`
   * （Nginx 把 /api 转给后端），浏览器侧这样最省事：无 CORS、无写死的域名。
   * 但 SSR 跑在 Node 里，`$fetch('/api/v1/...')` 会因为无法解析相对路径直接抛错，
   * 所以服务端改用私有配置 `apiBaseServer`（容器内是 `http://api:3000/api/v1`）。
   *
   * 回退顺序：优先用当前环境对应的那个；万一 apiBaseServer 没配（比如本地开发），
   * 退回 public.apiBase —— 本地两者本来就是同一个地址，行为不变。
   */
  const serverBase = String(config.apiBaseServer ?? '');
  const publicBase = String(config.public.apiBase);
  const rawBase = import.meta.server && serverBase ? serverBase : publicBase;
  const baseURL = rawBase.replace(/\/$/, '');

  const state = useAuthState();

  function buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = `${baseURL}${path.startsWith('/') ? path : `/${path}`}`;
    if (!query) return url;

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        if (!v.length) continue;
        params.append(k, v.join(','));
      } else {
        params.append(k, String(v));
      }
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  /** 用 refresh token 换新令牌。成功返回 true。 */
  async function doRefresh(): Promise<boolean> {
    const token = readRefreshToken();
    if (!token) return false;

    try {
      const pair = await $fetch<{ accessToken: string; refreshToken: string }>(
        `${baseURL}/auth/refresh`,
        {
          method: 'POST',
          body: { refreshToken: token },
          headers: { 'Content-Type': 'application/json' },
        },
      );
      persistTokens(pair);
      return true;
    } catch {
      // refresh token 也过期/被吊销了：清干净，让守卫去跳登录页
      clearSession();
      return false;
    }
  }

  function refreshOnce(): Promise<boolean> {
    if (!inflightRefresh) {
      inflightRefresh = doRefresh().finally(() => {
        inflightRefresh = null;
      });
    }
    return inflightRefresh;
  }

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const send = async (): Promise<T> => {
      const headers: Record<string, string> = { ...options.headers };
      if (!options.anonymous && state.value.accessToken) {
        headers.Authorization = `Bearer ${state.value.accessToken}`;
      }

      // FormData 交给浏览器自己设 Content-Type（它要补 boundary）
      const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
      if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

      try {
        return await $fetch<T>(buildUrl(path, options.query), {
          method,
          headers,
          body: body as never,
          signal: options.signal,
        });
      } catch (e: unknown) {
        throw toApiError(e);
      }
    };

    try {
      return await send();
    } catch (e) {
      // 401 且不是刷新接口自身 → 换令牌重放一次
      if (
        e instanceof ApiError &&
        e.isUnauthorized &&
        !options.skipAuthRefresh &&
        !options.anonymous
      ) {
        const ok = await refreshOnce();
        if (ok) {
          try {
            return await send();
          } catch (retryError) {
            throw toApiError(retryError);
          }
        }
      }
      throw e;
    }
  }

  return {
    /** 底层方法，返回解析后的响应体；失败抛 ApiError */
    request,
    get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('POST', path, body, options),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('PATCH', path, body, options),
    del: <T>(path: string, options?: RequestOptions) =>
      request<T>('DELETE', path, undefined, options),

    /** 供插件/守卫使用：主动恢复一次会话 */
    ensureFreshToken: refreshOnce,
    clearSession,
  };
}

/**
 * 把 ofetch 抛出的错误压成 ApiError。
 *
 * NestJS 的错误体是 `{ statusCode, error, message }`，其中 message 在
 * 参数校验失败时是**字符串数组**（class-validator 每个约束一条）。
 * 数组直接展示会很难看，这里合并成一行。
 */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;

  const err = e as {
    response?: { status?: number; _data?: unknown };
    statusCode?: number;
    data?: unknown;
    message?: string;
  };

  const status = err?.response?.status ?? err?.statusCode ?? 0;
  const payload = (err?.response?._data ?? err?.data) as Partial<ErrorResponseDto> | undefined;

  if (payload && typeof payload === 'object' && 'message' in payload) {
    const raw = payload.message;
    const text = Array.isArray(raw) ? raw.join('；') : String(raw ?? '');
    return new ApiError(status || 500, text || '请求失败', String(payload.error ?? ''), payload.path);
  }

  // 连不上后端 / 网络中断 / 超时：给一句人能看懂的话，而不是 "fetch failed"
  if (!status) {
    return new ApiError(0, '无法连接到服务器，请检查网络或后端服务是否已启动');
  }

  return new ApiError(status, err?.message || `请求失败（HTTP ${status}）`);
}
