/* eslint-disable */
/**
 * ⚠️ 本文件由 `npm run gen:api` 自动生成，请勿手动修改。
 *
 * 来源：server/openapi.json（后端 `npm run openapi:export` 产出）
 * 契约：OpenAPI 3.0.0 — 博客平台 API v1.0.0
 * 模型：59 个
 * 生成时间：2026-09-18T10:01:30.229Z
 *
 * 改字段的唯一正确姿势：改后端 DTO → 重新导出 openapi.json → 重新生成本文件。
 */

export interface ArchiveItemDto {
  /** 年份 */
  year: number;
  /** 月份 */
  month: number;
  /** 该月文章数 */
  count: number;
  /** 该月文章（按时间倒序，最多 50 篇） */
  articles: ArticleListItemDto[];
}

export interface ArticleAuthorDto {
  /** 作者 ID */
  id: string;
  /** 用户名，可跳转 /author/{username} */
  username: string;
  /** 昵称 */
  nickname: string;
  /** 头像 */
  avatarUrl?: string | null;
}

export interface ArticleCategoryDto {
  /** 分类 ID */
  id: string;
  /** 分类名 */
  name: string;
  /** 分类 slug */
  slug: string;
}

export interface ArticleDetailDto {
  /** 文章 ID */
  id: string;
  /** 标题 */
  title: string;
  /** URL 标识 */
  slug: string;
  /** 摘要 */
  summary: string;
  /** 封面图 */
  coverUrl?: string | null;
  /** 是否置顶 */
  isTop: boolean;
  /** 阅读量 */
  viewCount: number;
  /** 点赞数 */
  likeCount: number;
  /** 已通过的评论数 */
  commentCount: number;
  /** 发布时间；为 null 表示尚未发布 */
  publishedAt?: string | null;
  /** 最后更新时间 */
  updatedAt: string;
  /** 作者 */
  author: ArticleAuthorDto;
  /** 分类；未分类时为 null */
  category?: ArticleCategoryDto | null;
  /** 标签列表 */
  tags: ArticleTagDto[];
  /** Markdown 原文（编辑器回填用） */
  content: string;
  /** 渲染并净化后的 HTML，可直接 v-html 注入 */
  contentHtml: string;
  /** 正文目录（h2–h4） */
  toc: TocItemDto[];
  /** 作者简介 */
  authorBio: string | null;
  /** 作者 GitHub */
  authorGithub: string | null;
  /** 当前请求方是否已点赞过（按 IP + 文章去重） */
  likedByMe: boolean;
  /** 当前请求方是否可以编辑这篇文章（作者本人或管理员） */
  canEdit: boolean;
}

export interface ArticleListItemDto {
  /** 文章 ID */
  id: string;
  /** 标题 */
  title: string;
  /** URL 标识 */
  slug: string;
  /** 摘要 */
  summary: string;
  /** 封面图 */
  coverUrl?: string | null;
  /** 是否置顶 */
  isTop: boolean;
  /** 阅读量 */
  viewCount: number;
  /** 点赞数 */
  likeCount: number;
  /** 已通过的评论数 */
  commentCount: number;
  /** 发布时间；为 null 表示尚未发布 */
  publishedAt?: string | null;
  /** 最后更新时间 */
  updatedAt: string;
  /** 作者 */
  author: ArticleAuthorDto;
  /** 分类；未分类时为 null */
  category?: ArticleCategoryDto | null;
  /** 标签列表 */
  tags: ArticleTagDto[];
}

export interface ArticleManageDto {
  /** 文章 ID */
  id: string;
  /** 标题 */
  title: string;
  /** URL 标识 */
  slug: string;
  /** 正文 Markdown 原文 */
  content: string;
  /** 摘要 */
  summary: string;
  /** 封面图 */
  coverUrl?: string | null;
  /** 状态 */
  status: ('draft' | 'published' | 'deleted');
  /** 是否置顶 */
  isTop: boolean;
  /** 分类 ID */
  categoryId?: string | null;
  /** 分类名 */
  categoryName?: string | null;
  /** 标签名数组 */
  tags: string[];
  /** 阅读量 */
  viewCount: number;
  /** 点赞数 */
  likeCount: number;
  /** 评论数 */
  commentCount: number;
  /** 计划/实际发布时间 */
  publishedAt?: string | null;
  /** 移入回收站的时间 */
  deletedAt?: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 作者 ID */
  authorId: string;
  /** 作者昵称 */
  authorNickname: string;
}

export interface ArticleStatsDto {
  /** 文章总数（不含回收站） */
  total: number;
  /** 已发布 */
  published: number;
  /** 草稿 */
  draft: number;
  /** 回收站 */
  deleted: number;
  /** 定时发布中（已设为 published 但发布时间未到） */
  scheduled: number;
}

export interface ArticleTagDto {
  /** 标签 ID */
  id: string;
  /** 标签名 */
  name: string;
  /** 标签 slug */
  slug: string;
}

export interface AuthorProfileDto {
  /** 用户 ID */
  id: string;
  /** 用户名 */
  username: string;
  /** 昵称 */
  nickname: string;
  /** 头像 */
  avatarUrl?: string | null;
  /** 简介 */
  bio?: string | null;
  /** 个人主页 */
  website?: string | null;
  /** GitHub */
  github?: string | null;
  /** 加入时间 */
  joinedAt: string;
  /** 已发布的文章数 */
  articleCount: number;
  /** 累计获得阅读量 */
  totalViews: number;
  /** 累计获得点赞数 */
  totalLikes: number;
}

export interface AuthorProfilePageDto {
  /** 作者资料 */
  author: AuthorProfileDto;
  /** 该作者的文章 */
  articles: ArticleListItemDto[];
  /** 文章总数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

export interface BatchModerateDto {
  /** 要处理的评论 ID 列表 */
  ids: string[];
  /** 批量动作 */
  action: ('approve' | 'reject' | 'delete');
}

export interface BatchModerateResultDto {
  /** 实际处理条数 */
  affected: number;
  /** 结果说明 */
  message: string;
}

export interface CategoryResponseDto {
  /** 分类 ID */
  id: string;
  /** 分类名 */
  name: string;
  /** URL 标识 */
  slug: string;
  /** 描述 */
  description?: string | null;
  /** 排序值 */
  sortOrder: number;
  /** 该分类下已发布的文章数 */
  articleCount: number;
}

export interface ChangePasswordDto {
  /** 当前密码 */
  oldPassword: string;
  /** 新密码：至少 8 位，且同时包含字母与数字 */
  newPassword: string;
}

export interface CommentAdminViewDto {
  /** 评论 ID */
  id: string;
  /** 所属文章 ID */
  articleId: string;
  /** 父评论 ID；顶级评论为 null */
  parentId?: string | null;
  /** 评论正文 */
  content: string;
  /** 审核状态。前台列表只返回 approved；提交接口会返回本条的真实状态 */
  status: ('pending' | 'approved' | 'rejected');
  /** 展示昵称。登录用户取其账号昵称，游客取提交时填写的昵称 */
  nickname: string;
  /** 头像（登录用户才有） */
  avatarUrl?: string | null;
  /** 个人网站 */
  website?: string | null;
  /** 是否为登录用户发的评论 */
  isRegistered: boolean;
  /** 是否为文章作者的评论（前端可加「作者」标识） */
  isArticleAuthor: boolean;
  /** 提交时间 */
  createdAt: string;
  /** 对顶级评论的回复；顶级评论的 replies 为空数组 */
  replies: CommentDto[];
  /** 邮箱（仅管理员可见） */
  email?: string | null;
  /** 提交 IP（仅管理员可见） */
  ipAddress?: string | null;
  /** User-Agent 摘要 */
  userAgent?: string | null;
  /** 所属文章标题 */
  articleTitle: string;
  /** 所属文章 slug */
  articleSlug: string;
}

export interface CommentDto {
  /** 评论 ID */
  id: string;
  /** 所属文章 ID */
  articleId: string;
  /** 父评论 ID；顶级评论为 null */
  parentId?: string | null;
  /** 评论正文 */
  content: string;
  /** 审核状态。前台列表只返回 approved；提交接口会返回本条的真实状态 */
  status: ('pending' | 'approved' | 'rejected');
  /** 展示昵称。登录用户取其账号昵称，游客取提交时填写的昵称 */
  nickname: string;
  /** 头像（登录用户才有） */
  avatarUrl?: string | null;
  /** 个人网站 */
  website?: string | null;
  /** 是否为登录用户发的评论 */
  isRegistered: boolean;
  /** 是否为文章作者的评论（前端可加「作者」标识） */
  isArticleAuthor: boolean;
  /** 提交时间 */
  createdAt: string;
  /** 对顶级评论的回复；顶级评论的 replies 为空数组 */
  replies: CommentDto[];
}

export interface CommentPageDto {
  /** 顶级评论（每条内含 replies） */
  items: CommentDto[];
  /** 顶级评论总数（不含回复） */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

export interface CommentStatsDto {
  /** 待审核 */
  pending: number;
  /** 已通过 */
  approved: number;
  /** 已拒绝 */
  rejected: number;
  /** 今日新增 */
  today: number;
}

export interface CreateArticleDto {
  /** 标题 */
  title: string;
  /** 正文（Markdown 原文）。服务端会渲染成 HTML 并做 XSS 白名单过滤后缓存 */
  content: string;
  /** 摘要；留空则自动从正文截取前 200 字 */
  summary?: string;
  /** URL 标识；留空则根据标题自动生成（中文保留原字） */
  slug?: string;
  /** 封面图地址 */
  coverUrl?: string;
  /** 分类 ID（只能选用管理员已创建的分类） */
  categoryId?: string | null;
  /** 标签名数组。不存在的标签会被自动创建（FR-3.2 作者可自由创建标签） */
  tags?: string[];
  /** 发布状态。draft=存为草稿；published=发布（配合 publishedAt 可做定时发布） */
  status?: ('draft' | 'published');
  /** 发布时间（ISO 8601）。传未来时间即为「定时发布」——前台在到点前不会展示，到点自动可见，无需定时任务。不传则取当前时间。 */
  publishedAt?: string;
  /** 是否置顶（作者可置顶自己的文章） */
  isTop?: boolean;
}

export interface CreateCategoryDto {
  /** 分类名 */
  name: string;
  /** URL 标识；留空则根据名称生成。必须是全小写字母/数字/短横线 */
  slug?: string;
  /** 分类描述 */
  description?: string;
  /** 排序值，越小越靠前 */
  sortOrder?: number;
}

export interface CreateCommentDto {
  /** 评论正文，最多 2000 字 */
  content: string;
  /** 昵称。**已登录时可省略**（自动取账号昵称）；游客必填 */
  nickname?: string;
  /** 邮箱，仅站内通知使用，不会公开展示 */
  email?: string;
  /** 个人网站 */
  website?: string;
  /** 父评论 ID。填了就是对某条**顶级评论**的回复；回复的回复会被数据库触发器拒绝（两级结构，FR-4.2） */
  parentId?: string;
}

export interface CreateCommentResultDto {
  /** 提交后的提示文案，前端直接展示即可 */
  message: string;
  /** 是否进入待审核队列 */
  pendingReview: boolean;
  /** 新建的评论；待审核时也在返回里，但不会出现在公开列表中 */
  comment: CommentDto;
}

export interface CreateTagDto {
  /** 标签名 */
  name: string;
  /** URL 标识；留空自动生成 */
  slug?: string;
}

export interface CurrentUserResponseDto {
  /** 当前登录用户 */
  user: UserProfileDto;
  /** 账号已激活，可发布文章 */
  canPublish: boolean;
}

export interface ErrorResponseDto {
  /** HTTP 状态码 */
  statusCode: number;
  /** 错误简述 */
  error: string;
  /** 错误详情；校验失败时为字符串数组 */
  message: unknown;
  /** 请求路径 */
  path: string;
  /** 发生时间（ISO 8601） */
  timestamp: string;
}

export interface LikeResultDto {
  /** 该文章当前点赞总数 */
  likeCount: number;
  /** 当前请求方是否已点赞 */
  liked: boolean;
  /** 本次操作是否改变了状态（重复点赞会被幂等忽略） */
  changed: boolean;
}

export interface LoginDto {
  /** 用户名或邮箱 */
  account: string;
  /** 密码 */
  password: string;
}

export interface LoginResponseDto {
  /** 当前登录用户资料 */
  user: UserProfileDto;
  /** 令牌对 */
  tokens: TokenPairDto;
}

export interface MergeTagsDto {
  /** 被合并掉的标签 ID 列表（合并后这些标签会被删除，其文章改挂到目标标签） */
  sourceTagIds: string[];
  /** 保留的目标标签 ID */
  targetTagId: string;
}

export interface OperationResultDto {
  /** 是否成功 */
  success: boolean;
  /** 附带说明 */
  message?: string;
}

export interface OverviewDto {
  /** 文章统计 */
  articles: ArticleStatsDto;
  /** 用户统计 */
  users: UserStatsDto;
  /** 评论统计 */
  comments: CommentStatsDto;
  /** 访问量汇总 */
  views: ViewsSummaryDto;
  /** 近 N 天的趋势曲线 */
  trend: TrendPointDto[];
}

export interface PublicSiteSettingsDto {
  /** 站点名称 */
  siteName: string;
  /** 站点副标题 / SEO description */
  siteDescription: string;
  /** Logo 地址 */
  siteLogo?: string | null;
  /** favicon 地址 */
  siteFavicon?: string | null;
  /** ICP 备案号；为空则前台不展示 */
  icpNumber?: string | null;
  /** 前台列表每页条数 */
  perPage: number;
  /** 是否开放自助注册 */
  registerEnabled: boolean;
  /** 注册后是否需要管理员审核 */
  registerNeedApprove: boolean;
  /** 评论功能是否开启 */
  commentEnabled: boolean;
  /** 新评论是否需要审核 */
  commentNeedApprove: boolean;
  /** 是否允许未登录访客评论 */
  commentAllowGuest: boolean;
  /** 社交链接 */
  socialLinks: SocialLinkDto[];
}

export interface PublishArticleDto {
  /** 发布时间；传未来时间即为定时发布。不传则立即发布 */
  publishedAt?: string;
}

export interface RefreshTokenDto {
  /** 登录时下发的 refreshToken */
  refreshToken: string;
}

export interface RegisterDto {
  /** 用户名：全小写，仅允许字母/数字/短横线/下划线，3–50 位，同时作为作者主页地址 */
  username: string;
  /** 邮箱，用于登录与站内通知 */
  email: string;
  /** 密码：至少 8 位，且同时包含字母与数字 */
  password: string;
  /** 昵称：展示用，支持中文 */
  nickname: string;
}

export interface RegisterResponseDto {
  /** 注册结果提示 */
  message: string;
  /** 新账号（状态为 pending，需管理员审核后激活） */
  data: LoginResponseDto;
}

export interface ResetPasswordDto {
  /** 新密码。**留空则服务端随机生成一个**，并在响应里返回明文供管理员转告用户 */
  newPassword?: string;
}

export interface ResetPasswordResultDto {
  /** 是否成功 */
  success: boolean;
  /** 生成的新密码明文；管理员需转告用户并提醒尽快修改 */
  temporaryPassword: string;
  /** 提示 */
  message: string;
}

export interface SiteSettingsValuesDto {
  /** 配置键值对 */
  values: Record<string, unknown>;
  /** 配置项说明，键与 values 对应 */
  descriptions: Record<string, unknown>;
}

export interface SiteSummaryDto {
  /** 已发布文章数 */
  articleCount: number;
  /** 活跃作者数（有已发布文章的作者） */
  authorCount: number;
  /** 已通过的评论数 */
  commentCount: number;
  /** 累计访问量 */
  viewCount: number;
}

export interface SocialLinkDto {
  /** 展示名 */
  name: string;
  /** 链接 */
  url: string;
  /** 图标标识 */
  icon?: string;
}

export interface TagResponseDto {
  /** 标签 ID */
  id: string;
  /** 标签名 */
  name: string;
  /** URL 标识 */
  slug: string;
  /** 关联的文章数 */
  articleCount: number;
}

export interface TocItemDto {
  /** 标题层级（2–4） */
  level: number;
  /** 标题文本 */
  text: string;
  /** 锚点 id，前端据此生成 # 链接 */
  anchor: string;
}

export interface ToggleTopDto {
  /** 是否置顶 */
  isTop: boolean;
}

export interface TokenPairDto {
  /** 访问令牌，放入 Authorization: Bearer <token> */
  accessToken: string;
  /** 刷新令牌，accessToken 过期后用 /auth/refresh 换新的 */
  refreshToken: string;
  /** accessToken 有效期（秒） */
  expiresIn: number;
}

export interface TrendPointDto {
  /** 日期（YYYY-MM-DD） */
  date: string;
  /** 当日访问量 */
  views: number;
  /** 当日新增评论数 */
  comments: number;
  /** 当日发文数（按发布时间归集） */
  articles: number;
}

export interface UpdateArticleDto {
  /** 标题 */
  title?: string;
  /** 正文（Markdown 原文）。服务端会渲染成 HTML 并做 XSS 白名单过滤后缓存 */
  content?: string;
  /** 摘要；留空则自动从正文截取前 200 字 */
  summary?: string;
  /** URL 标识；留空则根据标题自动生成（中文保留原字） */
  slug?: string;
  /** 封面图地址 */
  coverUrl?: string;
  /** 分类 ID（只能选用管理员已创建的分类） */
  categoryId?: string | null;
  /** 标签名数组。不存在的标签会被自动创建（FR-3.2 作者可自由创建标签） */
  tags?: string[];
  /** 发布状态。draft=存为草稿；published=发布（配合 publishedAt 可做定时发布） */
  status?: ('draft' | 'published');
  /** 发布时间（ISO 8601）。传未来时间即为「定时发布」——前台在到点前不会展示，到点自动可见，无需定时任务。不传则取当前时间。 */
  publishedAt?: string;
  /** 是否置顶（作者可置顶自己的文章） */
  isTop?: boolean;
}

export interface UpdateCategoryDto {
  /** 分类名 */
  name?: string;
  /** URL 标识；留空则根据名称生成。必须是全小写字母/数字/短横线 */
  slug?: string;
  /** 分类描述 */
  description?: string;
  /** 排序值，越小越靠前 */
  sortOrder?: number;
}

export interface UpdateProfileDto {
  /** 昵称 */
  nickname?: string;
  /** 头像地址 */
  avatarUrl?: string;
  /** 个人简介，最多 500 字 */
  bio?: string;
  /** 个人主页 */
  website?: string;
  /** GitHub 账号或主页 */
  github?: string;
  /** 邮箱（修改后不影响登录，登录名仍是用户名） */
  email?: string;
}

export interface UpdateSettingsDto {
  /** 要更新的配置键值对。只接受白名单内的键（站点信息、每页条数、注册与评论开关、敏感词、社交链接），其余会被忽略 */
  values: Record<string, unknown>;
}

export interface UpdateSettingsResultDto {
  /** 是否成功 */
  success: boolean;
  /** 结果说明 */
  message: string;
  /** 实际被更新的配置键 */
  updated: string[];
}

export interface UpdateUserRoleDto {
  /** 目标角色 */
  role: ('admin' | 'author');
}

export interface UpdateUserStatusDto {
  /** 目标状态 */
  status: ('pending' | 'active' | 'disabled');
  /** 操作备注（仅记录到日志，不入库） */
  remark?: string;
}

export interface UploadedImageDto {
  /** 可公开访问的图片地址，直接用于 Markdown 图片语法或封面字段 */
  url: string;
  /** 服务器上的绝对路径，用于排查与备份脚本 */
  path: string;
  /** 生成的文件名（时间戳 + 内容哈希 + 随机段，不保留原始名） */
  filename: string;
  /** 文件字节数 */
  size: number;
  /** 经文件头校验后的真实 MIME 类型 */
  mimeType: string;
  /** 图片宽度（px）。可用于预留占位、避免加载时布局抖动 */
  width?: number;
  /** 图片高度（px） */
  height?: number;
}

export interface UserAdminViewDto {
  /** 用户 ID（字符串形式，避免 JS 大整数精度丢失） */
  id: string;
  /** 用户名，作者主页路径 /author/{username} */
  username: string;
  /** 昵称 */
  nickname: string;
  /** 邮箱（仅本人与管理员可见） */
  email: string;
  /** 头像地址 */
  avatarUrl?: string | null;
  /** 个人简介 */
  bio?: string | null;
  /** 个人主页 */
  website?: string | null;
  /** GitHub 链接 */
  github?: string | null;
  /** 角色 */
  role: ('admin' | 'author');
  /** 账号状态 */
  status: ('pending' | 'active' | 'disabled');
  /** 注册时间 */
  createdAt: string;
  /** 最近登录时间 */
  lastLoginAt?: string | null;
  /** 该用户的文章总数 */
  articleCount: number;
}

export interface UserProfileDto {
  /** 用户 ID（字符串形式，避免 JS 大整数精度丢失） */
  id: string;
  /** 用户名，作者主页路径 /author/{username} */
  username: string;
  /** 昵称 */
  nickname: string;
  /** 邮箱（仅本人与管理员可见） */
  email: string;
  /** 头像地址 */
  avatarUrl?: string | null;
  /** 个人简介 */
  bio?: string | null;
  /** 个人主页 */
  website?: string | null;
  /** GitHub 链接 */
  github?: string | null;
  /** 角色 */
  role: ('admin' | 'author');
  /** 账号状态 */
  status: ('pending' | 'active' | 'disabled');
  /** 注册时间 */
  createdAt: string;
}

export interface UserStatsDto {
  /** 用户总数（不含禁用） */
  total: number;
  /** 待审核 */
  pending: number;
  /** 已激活 */
  active: number;
  /** 已禁用 */
  disabled: number;
  /** 管理员数 */
  admins: number;
  /** 今日注册数 */
  todayNew: number;
}

export interface ViewResultDto {
  /** 上报后该文章的累计阅读量 */
  viewCount: number;
}

export interface ViewsSummaryDto {
  /** 累计访问量 */
  total: number;
  /** 今日访问量 */
  today: number;
  /** 近 7 天访问量 */
  last7Days: number;
}
