import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OverviewDto, SiteSummaryDto, TrendPointDto } from './dto/stats.dto';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(days = 7): Promise<OverviewDto> {
    const safeDays = Math.min(Math.max(days, 1), 90);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart.getTime() - 6 * 86400_000);
    const trendStart = new Date(todayStart.getTime() - (safeDays - 1) * 86400_000);

    const [
      articleTotal,
      articlePublished,
      articleDraft,
      articleDeleted,
      articleScheduled,
      userTotal,
      userPending,
      userActive,
      userDisabled,
      userAdmins,
      userTodayNew,
      commentPending,
      commentApproved,
      commentRejected,
      commentToday,
      viewTotal,
      viewToday,
      viewWeek,
    ] = await this.prisma.$transaction([
      this.prisma.article.count({ where: { status: { not: 'deleted' } } }),
      this.prisma.article.count({ where: { status: 'published', publishedAt: { lte: now } } }),
      this.prisma.article.count({ where: { status: 'draft' } }),
      this.prisma.article.count({ where: { status: 'deleted' } }),
      this.prisma.article.count({ where: { status: 'published', publishedAt: { gt: now } } }),
      this.prisma.user.count({ where: { status: { not: 'disabled' } } }),
      this.prisma.user.count({ where: { status: 'pending' } }),
      this.prisma.user.count({ where: { status: 'active' } }),
      this.prisma.user.count({ where: { status: 'disabled' } }),
      this.prisma.user.count({ where: { role: 'admin' } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.comment.count({ where: { status: 'pending' } }),
      this.prisma.comment.count({ where: { status: 'approved' } }),
      this.prisma.comment.count({ where: { status: 'rejected' } }),
      this.prisma.comment.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.pageView.count(),
      this.prisma.pageView.count({ where: { viewedAt: { gte: todayStart } } }),
      this.prisma.pageView.count({ where: { viewedAt: { gte: weekAgo } } }),
    ]);

    // 趋势单独查：它走 $queryRaw，返回的是普通 Promise 而不是 PrismaPromise，
    // 塞进 $transaction 数组会同时触发类型错误与运行期问题
    const trend = await this.buildTrend(trendStart);

    return {
      articles: {
        total: articleTotal,
        published: articlePublished,
        draft: articleDraft,
        deleted: articleDeleted,
        scheduled: articleScheduled,
      },
      users: {
        total: userTotal,
        pending: userPending,
        active: userActive,
        disabled: userDisabled,
        admins: userAdmins,
        todayNew: userTodayNew,
      },
      comments: {
        pending: commentPending,
        approved: commentApproved,
        rejected: commentRejected,
        today: commentToday,
      },
      views: { total: viewTotal, today: viewToday, last7Days: viewWeek },
      trend,
    };
  }

  /**
   * 近 N 天的趋势曲线。
   *
   * 用**原生 SQL 在数据库里按天聚合**，而不是把明细捞出来在 Node 里循环 ——
   * page_views 是增长最快的表，跑一年后一次全量读取就是几十万行。
   * `DATE_TRUNC` + `GROUP BY` 能吃到 viewed_at 上的索引。
   *
   * 另一个细节：连续 7 天里没有访问的那天不会出现在 GROUP BY 结果里，
   * 前端画折线图会断。所以先用 generate_series 造出完整日期序列再 LEFT JOIN ——
   * 这样补 0 的逻辑在 SQL 里一次完成。
   */
  private async buildTrend(start: Date): Promise<TrendPointDto[]> {
    return this.prisma.$queryRaw<TrendPointDto[]>`
      WITH days AS (
        SELECT generate_series(${start}::date, CURRENT_DATE, INTERVAL '1 day')::date AS day
      ),
      v AS (
        SELECT viewed_at::date AS day, COUNT(*)::int AS cnt
          FROM page_views
         WHERE viewed_at >= ${start}
         GROUP BY 1
      ),
      c AS (
        SELECT created_at::date AS day, COUNT(*)::int AS cnt
          FROM comments
         WHERE created_at >= ${start}
         GROUP BY 1
      ),
      a AS (
        SELECT COALESCE(published_at, created_at)::date AS day, COUNT(*)::int AS cnt
          FROM articles
         WHERE COALESCE(published_at, created_at) >= ${start}
           AND status <> 'deleted'
         GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
             COALESCE(v.cnt, 0)           AS views,
             COALESCE(c.cnt, 0)           AS comments,
             COALESCE(a.cnt, 0)           AS articles
        FROM days d
        LEFT JOIN v ON v.day = d.day
        LEFT JOIN c ON c.day = d.day
        LEFT JOIN a ON a.day = d.day
       ORDER BY d.day ASC
    `;
  }

  /** 站点概览（公开）：适合放在首页侧边栏 */
  async siteSummary(): Promise<SiteSummaryDto> {
    const now = new Date();
    const [articleCount, authorCount, commentCount, viewCount] = await this.prisma.$transaction([
      this.prisma.article.count({ where: { status: 'published', publishedAt: { lte: now } } }),
      // 有已发布文章的作者才算「活跃作者」，否则会把这个数字算得虚高
      this.prisma.user.count({
        where: {
          status: 'active',
          articles: { some: { status: 'published', publishedAt: { lte: now } } },
        },
      }),
      this.prisma.comment.count({ where: { status: 'approved' } }),
      this.prisma.pageView.count(),
    ]);

    return { articleCount, authorCount, commentCount, viewCount };
  }

  /** 保留：便于将来加“按作者排行”之类的报表 */
  async topAuthors(limit = 10): Promise<{ query: Prisma.UserFindManyArgs }> {
    return {
      query: {
        take: limit,
        orderBy: { articles: { _count: 'desc' } },
        select: { id: true, username: true, nickname: true, avatarUrl: true },
      },
    };
  }
}
