import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 列表/详情中嵌套的作者信息（脱敏后的公开资料） */
export class ArticleAuthorDto {
  @ApiProperty({ description: '作者 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '用户名，可跳转 /author/{username}', example: 'zhangsan' })
  username: string;

  @ApiProperty({ description: '昵称', example: '张三' })
  nickname: string;

  @ApiPropertyOptional({ description: '头像', type: String, nullable: true })
  avatarUrl?: string | null;
}

export class ArticleCategoryDto {
  @ApiProperty({ description: '分类 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '分类名', example: '后端' })
  name: string;

  @ApiProperty({ description: '分类 slug', example: 'backend' })
  slug: string;
}

export class ArticleTagDto {
  @ApiProperty({ description: '标签 ID', example: '3' })
  id: string;

  @ApiProperty({ description: '标签名', example: 'PostgreSQL' })
  name: string;

  @ApiProperty({ description: '标签 slug', example: 'postgresql' })
  slug: string;
}

/** 列表项：不含正文，避免列表接口响应体过大（NFR：列表接口 P95 < 300ms） */
export class ArticleListItemDto {
  @ApiProperty({ description: '文章 ID', example: '10' })
  id: string;

  @ApiProperty({ description: '标题', example: 'PostgreSQL 中文全文检索的正确姿势' })
  title: string;

  @ApiProperty({ description: 'URL 标识', example: 'postgresql-中文全文检索' })
  slug: string;

  @ApiProperty({ description: '摘要', example: 'tsvector 的 simple 配置对中文不分词……' })
  summary: string;

  @ApiPropertyOptional({ description: '封面图', type: String, nullable: true })
  coverUrl?: string | null;

  @ApiProperty({ description: '是否置顶', example: false })
  isTop: boolean;

  @ApiProperty({ description: '阅读量', example: 128 })
  viewCount: number;

  @ApiProperty({ description: '点赞数', example: 12 })
  likeCount: number;

  @ApiProperty({ description: '已通过的评论数', example: 5 })
  commentCount: number;

  @ApiPropertyOptional({ description: '发布时间；为 null 表示尚未发布', type: String, nullable: true })
  publishedAt?: string | null;

  @ApiProperty({ description: '最后更新时间' })
  updatedAt: string;

  @ApiProperty({ description: '作者', type: ArticleAuthorDto })
  author: ArticleAuthorDto;

  @ApiPropertyOptional({ description: '分类；未分类时为 null', type: ArticleCategoryDto, nullable: true })
  category?: ArticleCategoryDto | null;

  @ApiProperty({ description: '标签列表', type: [ArticleTagDto] })
  tags: ArticleTagDto[];
}

/** 目录项 */
export class TocItemDto {
  @ApiProperty({ description: '标题层级（2–4）', example: 2 })
  level: number;

  @ApiProperty({ description: '标题文本', example: '为什么 simple 配置对中文无效' })
  text: string;

  @ApiProperty({ description: '锚点 id，前端据此生成 # 链接', example: '为什么-simple-配置对中文无效' })
  anchor: string;
}

/** 文章详情：在列表项基础上补正文、目录与交互状态 */
export class ArticleDetailDto extends ArticleListItemDto {
  @ApiProperty({ description: 'Markdown 原文（编辑器回填用）' })
  content: string;

  @ApiProperty({ description: '渲染并净化后的 HTML，可直接 v-html 注入' })
  contentHtml: string;

  @ApiProperty({ description: '正文目录（h2–h4）', type: [TocItemDto] })
  toc: TocItemDto[];

  @ApiProperty({ description: '作者简介', type: String, nullable: true })
  authorBio?: string | null;

  @ApiProperty({ description: '作者 GitHub', type: String, nullable: true })
  authorGithub?: string | null;

  @ApiProperty({ description: '当前请求方是否已点赞过（按 IP + 文章去重）', example: false })
  likedByMe: boolean;

  @ApiProperty({ description: '当前请求方是否可以编辑这篇文章（作者本人或管理员）', example: false })
  canEdit: boolean;
}

/** 作者后台的文章视图：多出状态、分类 ID、标签名，供编辑器回填 */
export class ArticleManageDto {
  @ApiProperty({ description: '文章 ID', example: '10' })
  id: string;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: 'URL 标识' })
  slug: string;

  @ApiProperty({ description: '正文 Markdown 原文' })
  content: string;

  @ApiProperty({ description: '摘要' })
  summary: string;

  @ApiPropertyOptional({ description: '封面图', type: String, nullable: true })
  coverUrl?: string | null;

  @ApiProperty({ description: '状态', enum: ['draft', 'published', 'deleted'], example: 'draft' })
  status: string;

  @ApiProperty({ description: '是否置顶' })
  isTop: boolean;

  @ApiPropertyOptional({ description: '分类 ID', type: String, nullable: true })
  categoryId?: string | null;

  @ApiPropertyOptional({ description: '分类名', type: String, nullable: true })
  categoryName?: string | null;

  @ApiProperty({ description: '标签名数组', type: [String], example: ['PostgreSQL'] })
  tags: string[];

  @ApiProperty({ description: '阅读量' })
  viewCount: number;

  @ApiProperty({ description: '点赞数' })
  likeCount: number;

  @ApiProperty({ description: '评论数' })
  commentCount: number;

  @ApiPropertyOptional({ description: '计划/实际发布时间', type: String, nullable: true })
  publishedAt?: string | null;

  @ApiPropertyOptional({ description: '移入回收站的时间', type: String, nullable: true })
  deletedAt?: string | null;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;

  @ApiProperty({ description: '作者 ID' })
  authorId: string;

  @ApiProperty({ description: '作者昵称' })
  authorNickname: string;
}

/** 归档项：按年月聚合 */
export class ArchiveItemDto {
  @ApiProperty({ description: '年份', example: 2026 })
  year: number;

  @ApiProperty({ description: '月份', example: 9 })
  month: number;

  @ApiProperty({ description: '该月文章数', example: 7 })
  count: number;

  @ApiProperty({ description: '该月文章（按时间倒序，最多 50 篇）', type: [ArticleListItemDto] })
  articles: ArticleListItemDto[];
}

/** 点赞结果 */
export class LikeResultDto {
  @ApiProperty({ description: '该文章当前点赞总数', example: 13 })
  likeCount: number;

  @ApiProperty({ description: '当前请求方是否已点赞', example: true })
  liked: boolean;

  @ApiProperty({ description: '本次操作是否改变了状态（重复点赞会被幂等忽略）', example: true })
  changed: boolean;
}

/** 阅读量上报结果 */
export class ViewResultDto {
  @ApiProperty({ description: '上报后该文章的累计阅读量', example: 129 })
  viewCount: number;
}

/** 文章统计（后台用） */
export class ArticleStatsDto {
  @ApiProperty({ description: '文章总数（不含回收站）', example: 128 })
  total: number;

  @ApiProperty({ description: '已发布', example: 110 })
  published: number;

  @ApiProperty({ description: '草稿', example: 16 })
  draft: number;

  @ApiProperty({ description: '回收站', example: 2 })
  deleted: number;

  @ApiProperty({ description: '定时发布中（已设为 published 但发布时间未到）', example: 1 })
  scheduled: number;
}
