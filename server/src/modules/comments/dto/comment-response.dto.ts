import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 前台可见的评论 */
export class CommentDto {
  @ApiProperty({ description: '评论 ID', example: '5' })
  id: string;

  @ApiProperty({ description: '所属文章 ID', example: '10' })
  articleId: string;

  @ApiPropertyOptional({ description: '父评论 ID；顶级评论为 null', type: String, nullable: true })
  parentId?: string | null;

  @ApiProperty({ description: '评论正文' })
  content: string;

  @ApiProperty({
    description: '审核状态。前台列表只返回 approved；提交接口会返回本条的真实状态',
    enum: ['pending', 'approved', 'rejected'],
  })
  status: string;

  @ApiProperty({ description: '展示昵称。登录用户取其账号昵称，游客取提交时填写的昵称', example: '张三' })
  nickname: string;

  @ApiPropertyOptional({ description: '头像（登录用户才有）', type: String, nullable: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ description: '个人网站', type: String, nullable: true })
  website?: string | null;

  @ApiProperty({ description: '是否为登录用户发的评论', example: true })
  isRegistered: boolean;

  @ApiProperty({ description: '是否为文章作者的评论（前端可加「作者」标识）', example: false })
  isArticleAuthor: boolean;

  @ApiProperty({ description: '提交时间' })
  createdAt: string;

  @ApiProperty({ description: '对顶级评论的回复；顶级评论的 replies 为空数组', type: () => [CommentDto] })
  replies: CommentDto[];
}

/** 分页的评论列表 */
export class CommentPageDto {
  @ApiProperty({ description: '顶级评论（每条内含 replies）', type: [CommentDto] })
  items: CommentDto[];

  @ApiProperty({ description: '顶级评论总数（不含回复）', example: 18 })
  total: number;

  @ApiProperty({ description: '当前页码', example: 1 })
  page: number;

  @ApiProperty({ description: '每页条数', example: 20 })
  pageSize: number;

  @ApiProperty({ description: '总页数', example: 1 })
  totalPages: number;
}

/** 提交评论的结果 */
export class CreateCommentResultDto {
  @ApiProperty({ description: '提交后的提示文案，前端直接展示即可' })
  message: string;

  @ApiProperty({ description: '是否进入待审核队列', example: true })
  pendingReview: boolean;

  @ApiProperty({ description: '新建的评论；待审核时也在返回里，但不会出现在公开列表中', type: CommentDto })
  comment: CommentDto;
}

/** 后台评论视图：多出反垃圾与排查所需的信息 */
export class CommentAdminViewDto extends CommentDto {
  @ApiPropertyOptional({ description: '邮箱（仅管理员可见）', type: String, nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ description: '提交 IP（仅管理员可见）', type: String, nullable: true })
  ipAddress?: string | null;

  @ApiPropertyOptional({ description: 'User-Agent 摘要', type: String, nullable: true })
  userAgent?: string | null;

  @ApiProperty({ description: '所属文章标题', example: 'PostgreSQL 中文全文检索的正确姿势' })
  articleTitle: string;

  @ApiProperty({ description: '所属文章 slug' })
  articleSlug: string;
}

/** 评论统计（后台仪表盘用） */
export class CommentStatsDto {
  @ApiProperty({ description: '待审核', example: 7 })
  pending: number;

  @ApiProperty({ description: '已通过', example: 320 })
  approved: number;

  @ApiProperty({ description: '已拒绝', example: 15 })
  rejected: number;

  @ApiProperty({ description: '今日新增', example: 3 })
  today: number;
}

export class BatchModerateResultDto {
  @ApiProperty({ description: '实际处理条数', example: 3 })
  affected: number;

  @ApiProperty({ description: '结果说明' })
  message: string;
}
