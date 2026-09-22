import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Comment, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { JwtPayloadUser } from '../../common/decorators';
import { BatchModerateDto, CreateCommentDto, QueryCommentDto } from './dto/comment.dto';
import {
  BatchModerateResultDto,
  CommentAdminViewDto,
  CommentDto,
  CommentPageDto,
  CommentStatsDto,
  CreateCommentResultDto,
} from './dto/comment-response.dto';

/** 同一 IP 两次评论的最小间隔（秒），FR-4.4 反垃圾 */
const COMMENT_COOLDOWN_SECONDS = 60;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ================================================================ 前台：文章评论
  /**
   * 取某篇文章的评论。
   *
   * 分页的对象是**顶级评论**，每条顶级评论的回复一次性全带上。
   * 为什么不给回复也做分页：两级结构下每篇文章的回复量很小（个位数），
   * 分开分页会让前端要做「展开时再请求一次」的交互，成本大于收益。
   */
  async findForArticle(articleId: bigint, page: number, pageSize: number): Promise<CommentPageDto> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, authorId: true, status: true },
    });
    if (!article || article.status === 'deleted') {
      throw new NotFoundException('文章不存在');
    }

    const where: Prisma.CommentWhereInput = { articleId, parentId: null, status: 'approved' };

    const [topLevel, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.comment.count({ where }),
    ]);

    const topIds = topLevel.map((c) => c.id);
    const replies = topIds.length
      ? await this.prisma.comment.findMany({
          where: { parentId: { in: topIds }, status: 'approved' },
          include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
          // 回复按时间正序：这样对话读起来是自然的先后顺序
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const repliesByParent = new Map<string, CommentDto[]>();
    for (const reply of replies) {
      const key = reply.parentId!.toString();
      const list = repliesByParent.get(key) ?? [];
      list.push(this.toDto(reply, article.authorId));
      repliesByParent.set(key, list);
    }

    return {
      items: topLevel.map((c) => ({
        ...this.toDto(c, article.authorId),
        replies: repliesByParent.get(c.id.toString()) ?? [],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ================================================================ 提交评论
  async create(
    articleId: bigint,
    dto: CreateCommentDto,
    user: JwtPayloadUser | undefined,
    ip: string,
    userAgent?: string,
  ): Promise<CreateCommentResultDto> {
    const [commentEnabled, allowGuest, needApprove] = await Promise.all([
      this.settings.getBoolean('comment_enabled', true),
      this.settings.getBoolean('comment_allow_guest', true),
      this.settings.getBoolean('comment_need_approve', true),
    ]);

    if (!commentEnabled) {
      throw new ForbiddenException('本站已关闭评论功能');
    }

    // 全程用 userId 判断登录身份（见下方说明），这里先取出来供后续复用
    const userId = user?.id;
    if (!userId && !allowGuest) {
      throw new ForbiddenException('请先登录后再发表评论');
    }

    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!article || article.status !== 'published') {
      throw new NotFoundException('文章不存在或尚未发布，无法评论');
    }

    // 反垃圾 1：提交频率
    await this.assertNotTooFrequent(ip);

    // 反垃圾 2：敏感词。命中不会直接拒绝 —— 直接拒绝会让作者/读者困惑
    //「为什么发不出去」，改为强制进入待审核，由人工判断
    const sensitiveWords = await this.settings.getSensitiveWords();
    const hitWords = sensitiveWords.filter((w) => dto.content.includes(w));
    const forcePending = hitWords.length > 0;

    // 父评论校验：数据库触发器也会拦，但先在这里查一次能给出更友好的报错。
    // 触发器负责守住「绕过 API 直连数据库」的情况，两层都要有。
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: this.parseId(dto.parentId) },
        select: { id: true, articleId: true, parentId: true },
      });
      if (!parent) throw new BadRequestException('要回复的评论不存在');
      if (parent.articleId !== articleId) {
        throw new BadRequestException('不能跨文章回复评论');
      }
      if (parent.parentId !== null) {
        throw new BadRequestException('只支持两级评论，不能在回复下面继续回复');
      }
    }

    // 判断「是不是登录用户」要用 userId 是否存在，而不是 user 对象是否存在。
    // 只判断 user 的话，一旦上游传来一个没有 id 的用户对象（曾经真的发生过：
    // 公开接口的可选认证把 JWT 载荷原样塞进 request.user，而载荷里是 sub 不是 id），
    // 就会写出 user_id = NULL 且 nickname = NULL 的评论，
    // 直接撞上 DDL 里「游客必须有昵称」的 CHECK 约束，接口以 500 收场。
    if (!userId && !dto.nickname?.trim()) {
      throw new BadRequestException('游客评论必须填写昵称');
    }

    const status = needApprove || forcePending ? 'pending' : 'approved';

    const created = await this.prisma.comment.create({
      data: {
        articleId,
        userId: userId ?? null,
        parentId: dto.parentId ? this.parseId(dto.parentId) : null,
        nickname: userId ? null : dto.nickname?.trim(),
        email: dto.email || null,
        website: dto.website || null,
        content: dto.content.trim(),
        status,
        ipAddress: ip,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
    });

    const articleMeta = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { authorId: true },
    });

    return {
      message: buildSubmitMessage(status, forcePending, hitWords),
      pendingReview: status === 'pending',
      comment: this.toDto(created, articleMeta!.authorId),
    };
  }

  /** 同一 IP 的评论频率限制。这是一道很便宜但很有效的反刷屏措施 */
  private async assertNotTooFrequent(ip: string): Promise<void> {
    const since = new Date(Date.now() - COMMENT_COOLDOWN_SECONDS * 1000);
    const recent = await this.prisma.comment.findFirst({
      where: { ipAddress: ip, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    if (recent) {
      const wait = COMMENT_COOLDOWN_SECONDS - Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
      throw new BadRequestException(`评论过于频繁，请 ${Math.max(wait, 1)} 秒后再试`);
    }
  }

  // ================================================================ 后台列表
  async findAll(query: QueryCommentDto, user: JwtPayloadUser): Promise<{
    items: CommentAdminViewDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const where: Prisma.CommentWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.articleId) where.articleId = this.parseId(query.articleId);
    if (query.articleSlug) where.article = { slug: query.articleSlug };
    if (query.keyword) where.content = { contains: query.keyword, mode: 'insensitive' };

    // 作者只能看自己文章下的评论（FR-4.5）；管理员看全部
    if (user.role !== 'admin') {
      where.article = { ...(where.article as object), authorId: user.id };
    } else if (query.authorUsername) {
      where.article = { ...(where.article as object), author: { username: query.authorUsername } };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
          article: { select: { id: true, title: true, slug: true, authorId: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.toDto(row, row.article.authorId),
        email: row.email,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        articleTitle: row.article.title,
        articleSlug: row.article.slug,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async stats(): Promise<CommentStatsDto> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pending, approved, rejected, today] = await this.prisma.$transaction([
      this.prisma.comment.count({ where: { status: 'pending' } }),
      this.prisma.comment.count({ where: { status: 'approved' } }),
      this.prisma.comment.count({ where: { status: 'rejected' } }),
      this.prisma.comment.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

    return { pending, approved, rejected, today };
  }

  // ================================================================ 审核
  async moderate(
    id: bigint,
    action: 'approve' | 'reject',
    user: JwtPayloadUser,
  ): Promise<{ success: boolean; message: string }> {
    await this.assertCanManage(id, user);

    const status = action === 'approve' ? 'approved' : 'rejected';
    await this.prisma.comment.update({ where: { id }, data: { status } });

    // 不需要手工维护 articles.comment_count —— 触发器 trg_comments_sync_count
    // 会在 UPDATE 后自动重算。手工再改一次反而会重复计数。
    return {
      success: true,
      message: action === 'approve' ? '评论已通过审核' : '评论已拒绝，前台不再展示',
    };
  }

  async batchModerate(dto: BatchModerateDto, user: JwtPayloadUser): Promise<BatchModerateResultDto> {
    const ids = dto.ids.map((id) => this.parseId(id));
    if (ids.length === 0) throw new BadRequestException('请至少选择一条评论');
    if (ids.length > 100) throw new BadRequestException('单次最多处理 100 条');

    // 逐条校验归属：批量接口最容易成为越权漏洞的入口 ——
    // 一次请求里可能混入别人的评论，如果只校验「有权限」而校验「每条都有权限」就会漏
    for (const id of ids) {
      await this.assertCanManage(id, user);
    }

    if (dto.action === 'delete') {
      const { count } = await this.prisma.comment.deleteMany({ where: { id: { in: ids } } });
      return { affected: count, message: `已删除 ${count} 条评论` };
    }

    const status = dto.action === 'approve' ? 'approved' : 'rejected';
    const { count } = await this.prisma.comment.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    return {
      affected: count,
      message: dto.action === 'approve' ? `已通过 ${count} 条评论` : `已拒绝 ${count} 条评论`,
    };
  }

  async remove(id: bigint, user: JwtPayloadUser): Promise<{ success: boolean; message: string }> {
    await this.assertCanManage(id, user);
    // 删除顶级评论时，其回复由外键 ON DELETE CASCADE 一并删除
    await this.prisma.comment.delete({ where: { id } });
    return { success: true, message: '评论已删除' };
  }

  /** 作者可以管自己文章下的评论，管理员可以管全部 */
  private async assertCanManage(commentId: bigint, user: JwtPayloadUser): Promise<void> {
    if (user.role === 'admin') return;

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { article: { select: { authorId: true } } },
    });
    if (!comment) throw new NotFoundException('评论不存在');

    if (comment.article.authorId !== user.id) {
      throw new ForbiddenException('只能管理自己文章下的评论');
    }
  }

  // ================================================================ 内部
  private toDto(
    row: Comment & { user?: { id: bigint; nickname: string; avatarUrl: string | null } | null },
    articleAuthorId: bigint,
  ): CommentDto {
    const isRegistered = row.userId !== null;

    return {
      id: row.id.toString(),
      articleId: row.articleId.toString(),
      parentId: row.parentId ? row.parentId.toString() : null,
      content: row.content,
      status: row.status,
      // 昵称优先取账号昵称：用户改了昵称之后，他过去所有评论也会跟着更新 —— 这是期望行为
      nickname: isRegistered ? row.user?.nickname ?? '已注销用户' : row.nickname ?? '匿名',
      avatarUrl: isRegistered ? row.user?.avatarUrl ?? null : null,
      website: row.website,
      isRegistered,
      isArticleAuthor: isRegistered && row.userId === articleAuthorId,
      createdAt: row.createdAt.toISOString(),
      replies: [],
    };
  }

  private parseId(raw: string): bigint {
    try {
      return BigInt(raw);
    } catch {
      throw new BadRequestException(`无效的 ID：${raw}`);
    }
  }
}

function buildSubmitMessage(
  status: string,
  forcePending: boolean,
  hitWords: string[],
): string {
  if (status === 'approved') return '评论发表成功';
  if (forcePending && hitWords.length > 0) {
    return '评论已提交，因包含需要人工确认的内容，将在审核通过后展示';
  }
  return '评论已提交，审核通过后会展示出来';
}
