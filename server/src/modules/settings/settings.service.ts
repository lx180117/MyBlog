import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicSiteSettingsDto, UpdateSettingsDto } from './dto/settings.dto';

/**
 * 站点配置。
 *
 * 两个设计决定：
 * 1. **存 KV 而不是宽表**（DDL 已定）。加一个配置项不需要改表结构、不需要发迁移，
 *    代价是读取时要做类型转换，所以这里集中封装。
 * 2. **带 30 秒进程内缓存**。站点设置会被前台每个请求读取（判断评论开关、每页条数），
 *    每次都查库没有必要。用进程内 Map 而不是 Redis —— 单机部署下够用，
 *    且省掉一个中间件。写入时立刻失效缓存，保证后台改完立即生效。
 */

const CACHE_TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache: Map<string, string> | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** 取全部配置（原始 KV 形式） */
  async getAllRaw(): Promise<Record<string, string>> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return Object.fromEntries(this.cache);
    }

    const rows = await this.prisma.siteSetting.findMany();
    this.cache = new Map(rows.map((r) => [r.settingKey, r.settingValue ?? '']));
    this.cachedAt = Date.now();
    return Object.fromEntries(this.cache);
  }

  async get(key: string, fallback = ''): Promise<string> {
    const all = await this.getAllRaw();
    return all[key] ?? fallback;
  }

  async getBoolean(key: string, fallback: boolean): Promise<boolean> {
    const raw = await this.get(key, String(fallback));
    return raw === 'true' || raw === '1';
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.get(key, String(fallback));
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /** 敏感词列表（FR-4.4 简易敏感词过滤） */
  async getSensitiveWords(): Promise<string[]> {
    const raw = await this.get('sensitive_words', '');
    return raw
      .split(/[,，\n]/)
      .map((w) => w.trim())
      .filter(Boolean);
  }

  /** 前台可读的配置投影：只暴露访客需要知道的，不泄露敏感词、不暴露管理项 */
  async getPublicSettings(): Promise<PublicSiteSettingsDto> {
    const all = await this.getAllRaw();
    return {
      siteName: all.site_name ?? '我的博客',
      siteDescription: all.site_description ?? '',
      siteLogo: all.site_logo || null,
      siteFavicon: all.site_favicon || null,
      icpNumber: all.icp_number || null,
      perPage: Number(all.per_page) || 12,
      registerEnabled: all.register_enabled === 'true',
      registerNeedApprove: all.register_need_approve === 'true',
      commentEnabled: all.comment_enabled === 'true',
      commentNeedApprove: all.comment_need_approve === 'true',
      commentAllowGuest: all.comment_allow_guest === 'true',
      socialLinks: safeParseSocialLinks(all.social_links),
    };
  }

  /** 后台可读的完整配置（含敏感词，仅管理员） */
  async getAdminSettings() {
    const all = await this.getAllRaw();
    const rows = await this.prisma.siteSetting.findMany({ orderBy: { settingKey: 'asc' } });
    return {
      values: all,
      descriptions: Object.fromEntries(rows.map((r) => [r.settingKey, r.description ?? ''])),
    };
  }

  /** 批量更新；只接受白名单内的 key，避免前端塞任意键把表写脏 */
  async update(dto: UpdateSettingsDto): Promise<{ success: boolean; message: string; updated: string[] }> {
    const entries = Object.entries(dto.values ?? {}).filter(([key]) =>
      ALLOWED_KEYS.includes(key),
    );

    if (entries.length === 0) {
      throw new BadRequestException(
        `没有可更新的配置项。允许的键：${ALLOWED_KEYS.join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.siteSetting.upsert({
          where: { settingKey: key },
          update: { settingValue: String(value ?? '') },
          create: { settingKey: key, settingValue: String(value ?? ''), description: '' },
        }),
      ),
    );

    // 立即失效缓存，否则后台改完还要等最多 30 秒才生效，会被当成 bug 报上来
    this.invalidateCache();

    return {
      success: true,
      message: `已更新 ${entries.length} 项配置`,
      updated: entries.map(([key]) => key),
    };
  }

  invalidateCache(): void {
    this.cache = null;
    this.cachedAt = 0;
  }
}

/** 允许通过接口修改的配置键。不在这个列表里的一律拒绝 */
const ALLOWED_KEYS = [
  'site_name',
  'site_description',
  'site_logo',
  'site_favicon',
  'icp_number',
  'per_page',
  'register_enabled',
  'register_need_approve',
  'comment_enabled',
  'comment_need_approve',
  'comment_allow_guest',
  'sensitive_words',
  'social_links',
];

function safeParseSocialLinks(raw: string | undefined): { name: string; url: string; icon?: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 配置被写坏时返回空数组，而不是让整个站点首页 500
    return [];
  }
}
