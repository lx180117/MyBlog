/**
 * 从生成类型里派生出「有名字的」枚举别名，供业务代码使用。
 *
 * 为什么不在生成器里直接生成：
 *   OpenAPI 里这些枚举是内联在字段上的联合类型，没有独立名字。
 *   在这里用索引访问派生（而不是重新抄一遍字面量）——
 *   后端枚举一改，重新 gen:api 之后这里的别名会自动跟着变，
 *   如果手抄字面量就会静默失配。
 *
 * 本文件是**手写**的（不会被 gen:api 覆盖），但内容全部来自生成类型。
 */
import type { ArticleManageDto, CommentDto, UserProfileDto } from './api';

/* ---------------------------------------------------------------- 枚举 */

export type UserRole = UserProfileDto['role'];
export type UserStatus = UserProfileDto['status'];
export type ArticleStatus = ArticleManageDto['status'];
export type CommentStatus = CommentDto['status'];

export const USER_ROLES: readonly UserRole[] = ['admin', 'author'];
export const USER_STATUSES: readonly UserStatus[] = ['pending', 'active', 'disabled'];
export const ARTICLE_STATUSES: readonly ArticleStatus[] = ['draft', 'published', 'deleted'];
export const COMMENT_STATUSES: readonly CommentStatus[] = ['pending', 'approved', 'rejected'];

/* ---------------------------------------------------------------- 展示映射 */

/**
 * 状态色。取值刻意与 Element Plus `el-tag` 的 `type` 完全一致 ——
 * 这样展示映射可以**直接**喂给组件，不需要在模板里做类型断言。
 */
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface Option<T extends string> {
  value: T;
  label: string;
  tone: Tone;
}

export const USER_ROLE_META: Record<UserRole, Option<UserRole>> = {
  admin: { value: 'admin', label: '管理员', tone: 'danger' },
  author: { value: 'author', label: '作者', tone: 'info' },
};

/**
 * 账号三态（FR-1.6）。
 * `pending` 用 warning 而不是 info —— 它是一个**待办**，后台需要有人处理它，
 * 视觉上必须比别人显眼，否则注册申请会一直躺在列表里没人审。
 */
export const USER_STATUS_META: Record<UserStatus, Option<UserStatus>> = {
  pending: { value: 'pending', label: '待审核', tone: 'warning' },
  active: { value: 'active', label: '正常', tone: 'success' },
  disabled: { value: 'disabled', label: '已禁用', tone: 'danger' },
};

export const ARTICLE_STATUS_META: Record<ArticleStatus, Option<ArticleStatus>> = {
  draft: { value: 'draft', label: '草稿', tone: 'info' },
  published: { value: 'published', label: '已发布', tone: 'success' },
  deleted: { value: 'deleted', label: '回收站', tone: 'danger' },
};

export const COMMENT_STATUS_META: Record<CommentStatus, Option<CommentStatus>> = {
  pending: { value: 'pending', label: '待审核', tone: 'warning' },
  approved: { value: 'approved', label: '已通过', tone: 'success' },
  rejected: { value: 'rejected', label: '已拒绝', tone: 'danger' },
};

/* ---------------------------------------------------------------- 其它派生 */

/**
 * 站点配置是键值对表（`site_settings`），后端以 `Record<string, unknown>` 返回。
 * 前端真正用到的是这 13 个键 —— 在此收窄成明确类型，
 * 免得每处取值都写 `String(values.site_name ?? '')`。
 * 键名与 `db/schema.sql` 的初始数据、后端 PATCH /admin/settings 的白名单一致。
 */
export interface SettingsShape {
  site_name: string;
  site_description: string;
  site_logo: string;
  site_favicon: string;
  icp_number: string;
  per_page: string;
  register_enabled: string;
  register_need_approve: string;
  comment_enabled: string;
  comment_need_approve: string;
  comment_allow_guest: string;
  sensitive_words: string;
  /** JSON 字符串：`[{name,url,icon}]` */
  social_links: string;
}

/** 文章的排序方式，与 GET /articles 的 sort 参数一致 */
export type ArticleSort = 'latest' | 'oldest' | 'hot' | 'comments';

export const ARTICLE_SORT_OPTIONS: { value: ArticleSort; label: string }[] = [
  { value: 'latest', label: '最新发布' },
  { value: 'oldest', label: '最早发布' },
  { value: 'hot', label: '最多阅读' },
  { value: 'comments', label: '最多评论' },
];
