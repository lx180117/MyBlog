import type { PublicSiteSettingsDto, SiteSummaryDto } from '~/types/api';

/**
 * 站点公开配置（GET /settings）与站点概览（GET /site/summary）。
 *
 * 这两份数据几乎每个页面都要用（页头要站点名、页脚要备案号、列表要 per_page），
 * 所以放进 useState 全局共享：SSR 时服务端取一次、随 payload 一起送到客户端，
 * 客户端不会再重复请求。
 *
 * 后端的 /settings 本身有 30 秒进程内缓存，即使多请求一次也不算负担，
 * 但能省就省。
 */
export function useSettings() {
  const api = useApi();
  const config = useRuntimeConfig();

  const settings = useState<PublicSiteSettingsDto | null>('site-settings', () => null);
  const summary = useState<SiteSummaryDto | null>('site-summary', () => null);
  const pending = useState<Promise<void> | null>('site-settings-pending', () => null);

  async function load(): Promise<void> {
    if (settings.value) return;
    if (pending.value) return pending.value;

    pending.value = (async () => {
      try {
        settings.value = await api.get<PublicSiteSettingsDto>('/settings', { anonymous: true });
      } catch {
        // 后端暂时不可用时不能让整站崩掉，给一份能看的兜底值
        settings.value = {
          siteName: '我的博客',
          siteDescription: '',
          perPage: 12,
          registerEnabled: false,
          registerNeedApprove: true,
          commentEnabled: true,
          commentNeedApprove: true,
          commentAllowGuest: true,
          socialLinks: [],
        } as PublicSiteSettingsDto;
      } finally {
        pending.value = null;
      }
    })();

    return pending.value;
  }

  async function loadSummary(): Promise<void> {
    if (summary.value) return;
    try {
      summary.value = await api.get<SiteSummaryDto>('/site/summary', { anonymous: true });
    } catch {
      summary.value = { articleCount: 0, authorCount: 0, commentCount: 0, viewCount: 0 };
    }
  }

  const siteName = computed(() => settings.value?.siteName ?? '我的博客');
  const siteDescription = computed(() => settings.value?.siteDescription ?? '');
  const perPage = computed(() => settings.value?.perPage ?? 12);
  const commentEnabled = computed(() => settings.value?.commentEnabled ?? true);
  const commentAllowGuest = computed(() => settings.value?.commentAllowGuest ?? true);
  const commentNeedApprove = computed(() => settings.value?.commentNeedApprove ?? true);
  const registerEnabled = computed(() => settings.value?.registerEnabled ?? true);
  const registerNeedApprove = computed(() => settings.value?.registerNeedApprove ?? true);

  /**
   * 后端源站（去掉 /api/v1 前缀）。
   *
   * 用途：RSS、sitemap 这两个是后端直接输出的 XML，不是前端路由，
   * 必须指到后端去。开发环境是 http://localhost:3000；
   * 生产环境经 Nginx 反代后与前端同源（如 https://blog.example.com），
   * 所以这里从 apiBase 推导而不是写死。
   */
  const apiOrigin = computed(() =>
    String(config.public.apiBase).replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, ''),
  );
  const rssUrl = computed(() => `${apiOrigin.value}/rss.xml`);
  const sitemapUrl = computed(() => `${apiOrigin.value}/sitemap.xml`);

  return {
    settings,
    summary,
    load,
    loadSummary,
    siteName,
    siteDescription,
    perPage,
    commentEnabled,
    commentAllowGuest,
    commentNeedApprove,
    registerEnabled,
    registerNeedApprove,
    apiOrigin,
    rssUrl,
    sitemapUrl,
  };
}
