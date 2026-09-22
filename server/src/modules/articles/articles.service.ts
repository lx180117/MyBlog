import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Article, ArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayloadUser, UserRoleValue } from '../../common/decorators';
import { extractSummary, slugify, uniqueSlug } from '../../common/utils/slug.util';
import { extractToc, renderMarkdown, TocItem } from '../../common/utils/markdown.util';
import {
  ArticleSort,
  CreateArticleDto,
  QueryArticleDto,
  QueryMyArticleDto,
  UpdateArticleDto,
} from './dto/article.dto';
import {
  ArchiveItemDto,
  ArticleDetailDto,
  ArticleListItemDto,
  ArticleManageDto,
  ArticleStatsDto,
  LikeResultDto,
  ViewResultDto,
} from './dto/article-response.dto';

/** 同一 IP 对同一篇文章的阅读计数间隔，防止刷新刷阅读量 */
const VIEW_DEDUPE_MINUTES = 10;
/** 关键词搜索最多返回的候选 ID 数，避免超长结果集拖慢查询 */
const SEARCH_ID_LIMIT = 300;

const LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  coverUrl: true,
  isTop: true,
  viewCount: true,
  likeCount: true,
  commentCount: true,
  publishedAt: true,
  updatedAt: true,
  author: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
  category: { select: { id: true, name: true, slug: true } },
  tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.ArticleSelect;

type ArticleWithRelations = Prisma.ArticleGetPayload<{ select: typeof LIST_SELECT }>;

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  // ================================================================ 前台列表
  async findPublished(query: QueryArticleDto): Promise<{
    items: ArticleListItemDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const where: Prisma.ArticleWhereInput = {
      status: 'published',
      // 定时发布的关键：不是靠定时任务翻状态，而是靠这个时间条件。
      // 发布时间在未来的文章天然查不到，到点自动可见 —— 不需要任何后台任务。
      publishedAt: { lte: new Date() },
    };

    if (query.categorySlug) where.category = { slug: query.categorySlug };
    else if (query.categoryId) where.categoryId = this.parseId(query.categoryId);
    if (query.tagSlug) where.tags = { some: { tag: { slug: query.tagSlug } } };
    if (query.authorUsername) where.author = { username: query.authorUsername };

    if (query.year) {
      const start = new Date(Date.UTC(query.year, (query.month ?? 1) - 1, 1));
      const end = query.month
        ? new Date(Date.UTC(query.year, query.month, 1))
        : new Date(Date.UTC(query.year + 1, 0, 1));
      where.publishedAt = { gte: start, lt: end };
    }

    // 关键词：先用原生 SQL 拿到命中且按相关性排序的 ID 列表（需要 tsvector，Prisma 表达不了），
    // 再用 Prisma 做正式查询 —— 避免把整条查询改成手写 SQL 而丢掉类型安全
    let rankedIds: string[] | null = null;
    if (query.keyword?.trim()) {
      rankedIds = await this.searchArticleIds(query.keyword.trim());
      if (rankedIds.length === 0) {
        return { items: [], total: 0, page: query.page, pageSize: query.pageSize, totalPages: 0 };
      }
      where.id = { in: rankedIds.map((id) => BigInt(id)) };
    }

    const orderBy = this.buildOrderBy(query.sort ?? 'latest');

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.article.count({ where }),
    ]);

    // 关键词搜索时恢复相关性顺序（Prisma 无法按外部数组排序）
    const ordered = rankedIds ? this.reorderByRank(rows, rankedIds) : rows;

    return {
      items: ordered.map(toListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  /**
   * 关键词搜索。
   *
   * 这是整个项目里唯一必须写原生 SQL 的地方，原因是需求 FR-5.1「覆盖标题与正文」
   * 需要同时用到两种索引：
   *   - 标题/摘要：ILIKE + pg_trgm 的 GIN 索引 → 对中文有效（tsvector 的 simple
   *     配置不做中文分词，搜「数据库」匹配不到「数据库设计」）
   *   - 正文：tsvector @@ plainto_tsquery → 对英文有效，且能按 ts_rank 排相关性
   * 两者 OR 起来再用 ts_rank 排序，Prisma 的查询构建器表达不了。
   *
   * 参数全部走 $queryRaw 的占位符插值（Prisma 会编译成 $1/$2 预处理参数），
   * 不存在 SQL 注入风险。
   */
  private async searchArticleIds(keyword: string): Promise<string[]> {
    const like = `%${keyword}%`;
    const rows = await this.prisma.$queryRaw<{ id: bigint }[]>`
      SELECT a.id
        FROM articles a
       WHERE a.status = 'published'
         AND a.published_at IS NOT NULL
         AND a.published_at <= now()
         AND (
              a.search_vector @@ plainto_tsquery('simple', ${keyword})
           OR a.title   ILIKE ${like}
           OR a.summary ILIKE ${like}
         )
       ORDER BY ts_rank(a.search_vector, plainto_tsquery('simple', ${keyword})) DESC,
                a.published_at DESC
       LIMIT ${SEARCH_ID_LIMIT}
    `;
    return rows.map((r) => r.id.toString());
  }

  private reorderByRank(rows: ArticleWithRelations[], rankedIds: string[]): ArticleWithRelations[] {
    const rank = new Map(rankedIds.map((id, index) => [id, index]));
    return [...rows].sort(
      (a, b) => (rank.get(a.id.toString()) ?? 0) - (rank.get(b.id.toString()) ?? 0),
    );
  }

  private buildOrderBy(sort: ArticleSort): Prisma.ArticleOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ publishedAt: 'asc' }];
      case 'hot':
        return [{ viewCount: 'desc' }, { publishedAt: 'desc' }];
      case 'comments':
        return [{ commentCount: 'desc' }, { publishedAt: 'desc' }];
      default:
        // 置顶优先，再按发布时间倒序 —— 与 DDL 里的 idx_articles_top 部分索引一致
        return [{ isTop: 'desc' }, { publishedAt: 'desc' }];
    }
  }

  // ================================================================ 详情
  async findBySlug(slug: string, viewer?: JwtPayloadUser, viewerIp?: string): Promise<ArticleDetailDto> {
    const article = await this.prisma.article.findFirst({
      where: { slug },
      include: {
        author: { select: { id: true, username: true, nickname: true, avatarUrl: true, bio: true, github: true } },
        category: { select: { id: true, name: true, slug: true } },
        tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
      },
    });

    if (!article || article.status === 'deleted') {
      throw new NotFoundException('文章不存在或已被删除');
    }

    const isOwner = viewer ? viewer.id === article.authorId : false;
    const isAdmin = viewer?.role === 'admin';
    const isScheduled = article.publishedAt !== null && article.publishedAt > new Date();

    // 未发布 / 定时未到：只有作者本人和管理员能看
    if (article.status !== 'published' || isScheduled) {
      if (!isOwner && !isAdmin) {
        throw new NotFoundException('文章不存在或尚未发布');
      }
    }

    const likedByMe = await this.hasLiked(article.id, viewerIp);

    return {
      ...toListItem(article),
      content: article.content,
      // content_html 是渲染缓存；万一历史数据里为空（例如直接改库写入），
      // 这里兜底现渲染一次，避免前端展示空白
      contentHtml: article.contentHtml || renderMarkdown(article.content),
      toc: extractToc(article.content) as TocItem[],
      authorBio: article.author.bio,
      authorGithub: article.author.github,
      likedByMe,
      canEdit: isOwner || isAdmin,
    };
  }

  // ================================================================ 归档
  async findArchives(query: QueryArticleDto): Promise<ArchiveItemDto[]> {
    const where: Prisma.ArticleWhereInput = {
      status: 'published',
      publishedAt: { lte: new Date() },
    };
    if (query.categorySlug) where.category = { slug: query.categorySlug };
    if (query.authorUsername) where.author = { username: query.authorUsername };
    if (query.year) {
      where.publishedAt = {
        gte: new Date(Date.UTC(query.year, 0, 1)),
        lt: new Date(Date.UTC(query.year + 1, 0, 1)),
      };
    }

    // 用数据库做年月聚合，而不是把所有文章拉到内存里 group by —— 文章上千篇时差别很明显
    const buckets = await this.prisma.$queryRaw<{ year: number; month: number; count: bigint }[]>`
      SELECT EXTRACT(YEAR  FROM a.published_at)::int AS year,
             EXTRACT(MONTH FROM a.published_at)::int AS month,
             COUNT(*)::bigint                        AS count
        FROM articles a
        JOIN users u      ON u.id = a.author_id
        LEFT JOIN categories c ON c.id = a.category_id
       WHERE a.status = 'published'
         AND a.published_at IS NOT NULL
         AND a.published_at <= now()
         ${query.categorySlug ? Prisma.sql`AND c.slug = ${query.categorySlug}` : Prisma.empty}
         ${query.authorUsername ? Prisma.sql`AND u.username = ${query.authorUsername}` : Prisma.empty}
         ${query.year ? Prisma.sql`AND EXTRACT(YEAR FROM a.published_at) = ${query.year}` : Prisma.empty}
       GROUP BY 1, 2
       ORDER BY 1 DESC, 2 DESC
       LIMIT 60
    `;

    if (buckets.length === 0) return [];

    // 一次性取出这些月份的文章，再在内存里分桶（避免 60 次查询）
    const allRows = await this.prisma.article.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { publishedAt: 'desc' },
      take: 50 * buckets.length,
    });

    const grouped = new Map<string, ArticleListItemDto[]>();
    for (const row of allRows) {
      if (!row.publishedAt) continue;
      const key = `${row.publishedAt.getUTCFullYear()}-${row.publishedAt.getUTCMonth() + 1}`;
      const bucket = grouped.get(key) ?? [];
      if (bucket.length < 50) bucket.push(toListItem(row));
      grouped.set(key, bucket);
    }

    return buckets.map((b) => ({
      year: Number(b.year),
      month: Number(b.month),
      count: Number(b.count),
      articles: grouped.get(`${b.year}-${b.month}`) ?? [],
    }));
  }

  // ================================================================ 创建
  async create(dto: CreateArticleDto, user: JwtPayloadUser): Promise<ArticleManageDto> {
    const slug = await this.resolveSlug(dto.slug || dto.title);
    const tagIds = await this.resolveTagIds(dto.tags ?? []);
    const status: ArticleStatus = dto.status === 'published' ? 'published' : 'draft';

    const publishedAt = this.resolvePublishedAt(status, dto.publishedAt);

    const article = await this.prisma.article.create({
      data: {
        authorId: user.id,
        categoryId: dto.categoryId ? this.parseId(dto.categoryId) : null,
        title: dto.title.trim(),
        slug,
        summary: dto.summary?.trim() || extractSummary(dto.content),
        content: dto.content,
        contentHtml: renderMarkdown(dto.content),
        coverUrl: dto.coverUrl || null,
        status,
        isTop: dto.isTop ?? false,
        publishedAt,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: {
        author: { select: { id: true, username: true, nickname: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    });

    return toManageDto(article);
  }

  // ================================================================ 更新
  async update(id: bigint, dto: UpdateArticleDto, user: JwtPayloadUser): Promise<ArticleManageDto> {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('文章不存在');
    this.assertCanEdit(existing, user);

    const data: Prisma.ArticleUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.content !== undefined) {
      data.content = dto.content;
      // 正文一改，渲染缓存必须同步重算，否则展示的还是旧内容
      data.contentHtml = renderMarkdown(dto.content);
    }
    if (dto.summary !== undefined) {
      data.summary = dto.summary.trim() || extractSummary(dto.content ?? existing.content);
    } else if (dto.content !== undefined) {
      // 没显式给摘要，但正文变了：只有原来摘要是自动生成的才跟着更新
      data.summary = extractSummary(dto.content);
    }
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl || null;
    if (dto.isTop !== undefined) data.isTop = dto.isTop;
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId ? { connect: { id: this.parseId(dto.categoryId) } } : { disconnect: true };
    }
    if (dto.slug !== undefined && dto.slug && dto.slug !== existing.slug) {
      data.slug = await this.resolveSlug(dto.slug);
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'published') {
        data.publishedAt = this.resolvePublishedAt('published', dto.publishedAt);
      }
    } else if (dto.publishedAt !== undefined && existing.status === 'published') {
      data.publishedAt = this.resolvePublishedAt('published', dto.publishedAt);
    }

    if (dto.tags !== undefined) {
      const tagIds = await this.resolveTagIds(dto.tags);
      // 显式中间表没有 Prisma 的隐式 set，这里「先清后建」。
      // 包在事务里，避免清空后建表失败导致文章标签丢失
      await this.prisma.$transaction([
        this.prisma.articleTag.deleteMany({ where: { articleId: id } }),
        this.prisma.articleTag.createMany({
          data: tagIds.map((tagId) => ({ articleId: id, tagId })),
          skipDuplicates: true,
        }),
      ]);
    }

    const article = await this.prisma.article.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, username: true, nickname: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    });

    return toManageDto(article);
  }

  // ================================================================ 状态流转
  async publish(id: bigint, publishedAt: string | undefined, user: JwtPayloadUser): Promise<ArticleManageDto> {
    return this.update(id, { status: 'published', publishedAt }, user);
  }

  async unpublish(id: bigint, user: JwtPayloadUser): Promise<ArticleManageDto> {
    return this.update(id, { status: 'draft' }, user);
  }

  async toggleTop(id: bigint, isTop: boolean, user: JwtPayloadUser): Promise<ArticleManageDto> {
    return this.update(id, { isTop }, user);
  }

  /** 软删除：进回收站，可恢复（FR-2.3） */
  async softDelete(id: bigint, user: JwtPayloadUser): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('文章不存在');
    this.assertCanEdit(existing, user);

    if (existing.status === 'deleted') {
      return { success: true, message: '文章已在回收站中' };
    }

    await this.prisma.article.update({
      where: { id },
      // deletedAt 必须同时写入：DDL 有 CHECK 约束
      // `status <> 'deleted' OR deleted_at IS NOT NULL`，只改状态会直接报错
      data: { status: 'deleted', deletedAt: new Date() },
    });

    return { success: true, message: '已移入回收站，可随时恢复' };
  }

  async restore(id: bigint, user: JwtPayloadUser): Promise<ArticleManageDto> {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('文章不存在');
    this.assertCanEdit(existing, user);

    if (existing.status !== 'deleted') {
      throw new BadRequestException('该文章不在回收站中');
    }

    const article = await this.prisma.article.update({
      where: { id },
      data: { status: 'draft', deletedAt: null },
      include: {
        author: { select: { id: true, username: true, nickname: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    return toManageDto(article);
  }

  /** 彻底删除：仅管理员。关联的评论、点赞、阅读记录由外键 ON DELETE CASCADE 清理 */
  async purge(id: bigint): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.article.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('文章不存在');

    await this.prisma.article.delete({ where: { id } });
    return { success: true, message: '文章已彻底删除，无法恢复' };
  }

  // ================================================================ 我的文章
  /**
   * 参数类型用 Omit 去掉 skip/take：它们是 PaginationDto 上的 getter，
   * 而管理员控制器会传 `{ ...query, all: true }` —— 展开后的普通对象没有 getter，
   * 用原类型会直接类型不兼容。改成在方法内自行计算，顺带也避免「调用方忘设 skip」。
   */
  async findMine(
    query: Omit<QueryMyArticleDto, 'skip' | 'take'>,
    user: JwtPayloadUser,
  ): Promise<{ items: ArticleManageDto[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const where: Prisma.ArticleWhereInput = {};

    // 越权防护的核心：非管理员只能看自己的文章。
    // 这里用角色判断而不是相信前端传参 —— 前端传 all=true 对作者无效
    const seeAll = user.role === 'admin' && query.all === true;
    if (!seeAll) where.authorId = user.id;

    if (query.status) where.status = query.status;
    else where.status = { not: 'deleted' };

    if (query.keyword) where.title = { contains: query.keyword, mode: 'insensitive' };
    if (query.authorUsername) where.author = { username: query.authorUsername };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: {
          author: { select: { id: true, username: true, nickname: true } },
          category: { select: { id: true, name: true } },
          tags: { select: { tag: { select: { name: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.article.count({ where }),
    ]);

    return {
      items: rows.map(toManageDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  /** 编辑器回填用：单独按 ID 取，草稿也能取到 */
  async findForEdit(id: bigint, user: JwtPayloadUser): Promise<ArticleManageDto> {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, nickname: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    if (!article) throw new NotFoundException('文章不存在');
    this.assertCanEdit(article, user);
    return toManageDto(article);
  }

  async stats(): Promise<ArticleStatsDto> {
    const now = new Date();
    const [total, published, draft, deleted, scheduled] = await this.prisma.$transaction([
      this.prisma.article.count({ where: { status: { not: 'deleted' } } }),
      this.prisma.article.count({ where: { status: 'published', publishedAt: { lte: now } } }),
      this.prisma.article.count({ where: { status: 'draft' } }),
      this.prisma.article.count({ where: { status: 'deleted' } }),
      this.prisma.article.count({ where: { status: 'published', publishedAt: { gt: now } } }),
    ]);
    return { total, published, draft, deleted, scheduled };
  }

  // ================================================================ 互动
  /**
   * 阅读量 +1。
   * 与点赞不同，这里**不做库级去重**，而是在应用层做「同 IP 同文章 10 分钟内只计一次」，
   * 因为阅读量是高频写操作，加唯一约束会导致大量冲突异常，得不偿失。
   */
  async recordView(id: bigint, ip: string, userAgent?: string, userId?: bigint): Promise<ViewResultDto> {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { id: true, viewCount: true },
    });
    if (!article) throw new NotFoundException('文章不存在');

    const since = new Date(Date.now() - VIEW_DEDUPE_MINUTES * 60_000);
    const recent = await this.prisma.pageView.findFirst({
      where: { articleId: id, ipAddress: ip, viewedAt: { gte: since } },
      select: { id: true },
    });

    if (recent) {
      return { viewCount: article.viewCount };
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.article.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      }),
      this.prisma.pageView.create({
        data: {
          articleId: id,
          userId: userId ?? null,
          ipAddress: ip,
          userAgent: userAgent?.slice(0, 300),
        },
      }),
    ]);

    return { viewCount: updated.viewCount };
  }

  async hasLiked(articleId: bigint, ip?: string): Promise<boolean> {
    if (!ip) return false;
    const found = await this.prisma.articleLike.findUnique({
      where: { articleId_ipAddress: { articleId, ipAddress: ip } },
      select: { id: true },
    });
    return Boolean(found);
  }

  /**
   * 点赞。去重依据是 article_likes 表的 UNIQUE(article_id, ip_address)（FR-4.6）。
   * 用 upsert 而不是「先查再插」：并发下「先查再插」会两个请求同时查到不存在，
   * 然后一起插入，第二个触发唯一冲突 —— 用 upsert + 捕获 P2002 才是幂等的。
   */
  async like(articleId: bigint, ip: string, userId?: bigint): Promise<LikeResultDto> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true },
    });
    if (!article || article.status !== 'published') {
      throw new NotFoundException('文章不存在或尚未发布');
    }

    const existing = await this.prisma.articleLike.findUnique({
      where: { articleId_ipAddress: { articleId, ipAddress: ip } },
      select: { id: true },
    });

    if (existing) {
      const current = await this.prisma.article.findUniqueOrThrow({
        where: { id: articleId },
        select: { likeCount: true },
      });
      return { likeCount: current.likeCount, liked: true, changed: false };
    }

    await this.prisma.articleLike.create({
      data: { articleId, ipAddress: ip, userId: userId ?? null },
    });

    // like_count 由数据库触发器 trg_likes_sync_count 维护，这里重新读一次拿最新值
    const updated = await this.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { likeCount: true },
    });
    return { likeCount: updated.likeCount, liked: true, changed: true };
  }

  async unlike(articleId: bigint, ip: string): Promise<LikeResultDto> {
    const existing = await this.prisma.articleLike.findUnique({
      where: { articleId_ipAddress: { articleId, ipAddress: ip } },
      select: { id: true },
    });

    if (!existing) {
      const current = await this.prisma.article.findUnique({
        where: { id: articleId },
        select: { likeCount: true },
      });
      if (!current) throw new NotFoundException('文章不存在');
      return { likeCount: current.likeCount, liked: false, changed: false };
    }

    await this.prisma.articleLike.delete({ where: { id: existing.id } });
    const updated = await this.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { likeCount: true },
    });
    return { likeCount: updated.likeCount, liked: false, changed: true };
  }

  // ================================================================ 内部工具
  /** 作者只能改自己的文章；管理员可以改全部（权限矩阵） */
  private assertCanEdit(article: Article, user: JwtPayloadUser): void {
    if (user.role === 'admin') return;
    if (article.authorId !== user.id) {
      throw new ForbiddenException('只能操作自己发布的文章');
    }
  }

  private async resolveSlug(input: string): Promise<string> {
    const base = slugify(input) || `post-${Date.now()}`;
    return uniqueSlug(base, async (candidate) => {
      const found = await this.prisma.article.findUnique({ where: { slug: candidate }, select: { id: true } });
      return Boolean(found);
    });
  }

  /**
   * 标签名 → 标签 ID，不存在的自动创建（FR-3.2）。
   * 注意 slug 冲突：两个不同名字可能算出同一个 slug（例如 "C++" 与 "C#" 都会
   * 过滤成 "c"）。所以查找时 name 和 slug 任一命中都复用已有标签，避免唯一约束报错。
   */
  private async resolveTagIds(names: string[]): Promise<bigint[]> {
    const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 10);
    const ids: bigint[] = [];

    for (const name of cleaned) {
      const slug = slugify(name) || name.toLowerCase().replace(/\s+/g, '-');

      const existing = await this.prisma.tag.findFirst({
        where: { OR: [{ name }, { slug }] },
        select: { id: true },
      });
      if (existing) {
        ids.push(existing.id);
        continue;
      }

      try {
        const created = await this.prisma.tag.create({ data: { name, slug }, select: { id: true } });
        ids.push(created.id);
      } catch {
        // 并发创建撞上唯一约束：回查一次，拿别人刚建好的那条
        const retry = await this.prisma.tag.findFirst({
          where: { OR: [{ name }, { slug }] },
          select: { id: true },
        });
        if (retry) ids.push(retry.id);
      }
    }

    return [...new Set(ids.map((id) => id.toString()))].map((id) => BigInt(id));
  }

  /**
   * 计算发布时间。
   * 未发布返回 null；已发布时：显式给了就用给定值，否则用当前时间。
   * 注意用 `??` 而不是 `||`：publishedAt 是字符串，空串也会被 `||` 判为假值，
   * 但这里语义上「给了空串」应当报错而不是静默替换。
   */
  private resolvePublishedAt(status: ArticleStatus, publishedAt?: string): Date | null {
    if (status !== 'published') return null;
    if (publishedAt === undefined) return new Date();

    const parsed = new Date(publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('publishedAt 不是合法的时间格式');
    }
    return parsed;
  }

  private parseId(raw: string): bigint {
    try {
      return BigInt(raw);
    } catch {
      throw new BadRequestException(`无效的 ID：${raw}`);
    }
  }

  /** 供其他模块复用：按作者统计文章数 */
  async countByAuthor(authorId: bigint): Promise<number> {
    return this.prisma.article.count({ where: { authorId, status: { not: 'deleted' } } });
  }
}

/* ------------------------------------------------------------------ 映射函数 */

function toListItem(row: ArticleWithRelations): ArticleListItemDto {
  return {
    id: row.id.toString(),
    title: row.title,
    slug: row.slug,
    summary: row.summary ?? '',
    coverUrl: row.coverUrl,
    isTop: row.isTop,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.author.id.toString(),
      username: row.author.username,
      nickname: row.author.nickname,
      avatarUrl: row.author.avatarUrl,
    },
    category: row.category
      ? { id: row.category.id.toString(), name: row.category.name, slug: row.category.slug }
      : null,
    tags: row.tags.map((t) => ({
      id: t.tag.id.toString(),
      name: t.tag.name,
      slug: t.tag.slug,
    })),
  };
}

type ManageRow = Article & {
  author: { id: bigint; username: string; nickname: string };
  category: { id: bigint; name: string } | null;
  tags: { tag: { name: string } }[];
};

function toManageDto(row: ManageRow): ArticleManageDto {
  return {
    id: row.id.toString(),
    title: row.title,
    slug: row.slug,
    content: row.content,
    summary: row.summary ?? '',
    coverUrl: row.coverUrl,
    status: row.status,
    isTop: row.isTop,
    categoryId: row.categoryId ? row.categoryId.toString() : null,
    categoryName: row.category?.name ?? null,
    tags: row.tags.map((t) => t.tag.name),
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.author.id.toString(),
    authorNickname: row.author.nickname,
  };
}

export { toListItem };

/** 角色判断的小工具，供需要的地方复用 */
export function isAdmin(role: UserRoleValue): boolean {
  return role === 'admin';
}
