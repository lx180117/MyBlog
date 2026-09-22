import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { ArticlesService } from '../articles/articles.service';
import { UserAdminViewDto, UserProfileDto } from '../auth/dto/auth-response.dto';
import { toProfileDto } from '../auth/auth.service';
import {
  AuthorProfilePageDto,
  QueryUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly articles: ArticlesService,
  ) {}

  // ================================================================ 作者主页
  /**
   * 作者主页数据（FR-1.5）。
   * 一次性返回作者资料 + 文章列表，避免前端首屏发两次请求。
   */
  async findAuthorProfile(
    username: string,
    page: number,
    pageSize: number,
  ): Promise<AuthorProfilePageDto> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true,
        bio: true,
        website: true,
        github: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user || user.status === 'disabled') {
      throw new NotFoundException('该作者不存在');
    }

    const publishedWhere: Prisma.ArticleWhereInput = {
      authorId: user.id,
      status: 'published',
      publishedAt: { lte: new Date() },
    };

    const [articles, total, aggregate] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where: publishedWhere,
        select: {
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
        },
        orderBy: [{ isTop: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.article.count({ where: publishedWhere }),
      // 累计数据用数据库聚合，不把该作者所有文章拉到内存再求和
      this.prisma.article.aggregate({
        where: publishedWhere,
        _sum: { viewCount: true, likeCount: true },
      }),
    ]);

    return {
      author: {
        id: user.id.toString(),
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        website: user.website,
        github: user.github,
        joinedAt: user.createdAt.toISOString(),
        articleCount: total,
        totalViews: aggregate._sum.viewCount ?? 0,
        totalLikes: aggregate._sum.likeCount ?? 0,
      },
      // 字段拼装与文章模块的 toListDto 保持一致（同一份 ArticleListItemDto 契约）。
      // 不能直接复用 toListDto：这里查的是 author 而非 articles，Prisma select 形状不同。
      articles: articles.map((a) => ({
        id: a.id.toString(),
        title: a.title,
        slug: a.slug,
        summary: a.summary ?? '',
        coverUrl: a.coverUrl,
        isTop: a.isTop,
        viewCount: a.viewCount,
        likeCount: a.likeCount,
        commentCount: a.commentCount,
        publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
        updatedAt: a.updatedAt.toISOString(),
        author: {
          id: a.author.id.toString(),
          username: a.author.username,
          nickname: a.author.nickname,
          avatarUrl: a.author.avatarUrl,
        },
        category: a.category
          ? { id: a.category.id.toString(), name: a.category.name, slug: a.category.slug }
          : null,
        tags: a.tags.map((t) => ({ id: t.tag.id.toString(), name: t.tag.name, slug: t.tag.slug })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ================================================================ 管理员：用户列表
  async findAll(query: QueryUserDto): Promise<{
    items: UserAdminViewDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const where: Prisma.UserWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.role) where.role = query.role;
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword, mode: 'insensitive' } },
        { nickname: { contains: query.keyword, mode: 'insensitive' } },
        { email: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.hasArticles) where.articles = { some: {} };
    if (query.registeredBefore) {
      const date = new Date(query.registeredBefore);
      if (!Number.isNaN(date.getTime())) where.createdAt = { lt: date };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        // 待审核的排最前：后台进来第一眼就该看到需要处理的事
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
        include: {
          _count: { select: { articles: { where: { status: { not: 'deleted' } } } } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((u) => ({
        ...toProfileDto(u),
        email: u.email,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        articleCount: u._count.articles,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  // ================================================================ 审核与状态
  async updateStatus(
    id: bigint,
    dto: UpdateUserStatusDto,
    operatorId: bigint,
  ): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    // 防呆：管理员把自己的账号禁用了，就没人能再审核别人了。
    // 这是权限系统里最经典的自锁场景，必须在服务端拦
    if (id === operatorId && dto.status !== 'active') {
      throw new BadRequestException('不能对自己的账号执行禁用或退回待审核操作');
    }

    // 同理：不能禁用最后一个可用的管理员
    if (user.role === 'admin' && dto.status !== 'active') {
      const activeAdmins = await this.prisma.user.count({
        where: { role: 'admin', status: 'active', id: { not: id } },
      });
      if (activeAdmins === 0) {
        throw new BadRequestException('系统至少需要保留一名启用状态的管理员');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: dto.status,
        // 激活时顺手清掉登录失败计数，否则用户审核通过后还要等锁定时间过去
        ...(dto.status === 'active' ? { loginFailCount: 0, lockedUntil: null } : {}),
      },
    });

    return toProfileDto(updated);
  }

  async updateRole(id: bigint, dto: UpdateUserRoleDto, operatorId: bigint): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    if (id === operatorId && dto.role !== 'admin') {
      // Prisma 的枚举类型是字面量联合，这里显式比较避免 TS 报无意义比较
      throw new BadRequestException('不能取消自己的管理员角色');
    }

    if (user.role === 'admin' && dto.role !== 'admin') {
      const otherAdmins = await this.prisma.user.count({
        where: { role: 'admin', status: 'active', id: { not: id } },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException('系统至少需要保留一名管理员');
      }
    }

    const updated = await this.prisma.user.update({ where: { id }, data: { role: dto.role } });
    return toProfileDto(updated);
  }

  // ================================================================ 重置密码
  /**
   * 管理员重置密码（FR-1.8：v1 不接邮件服务，忘记密码由管理员后台重置）。
   * 不传新密码时由服务端生成随机密码 —— 管理员自己想一个弱密码才是风险。
   */
  async resetPassword(id: bigint, newPassword?: string): Promise<{ success: boolean; temporaryPassword: string; message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    const plain = newPassword ?? generateReadablePassword();
    const strengthError = this.password.validateStrength(plain);
    if (strengthError) throw new BadRequestException(strengthError);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await this.password.hash(plain),
        // 重置密码同时解锁：否则用户拿到新密码却因为旧锁定登不进去
        loginFailCount: 0,
        lockedUntil: null,
      },
    });

    return {
      success: true,
      temporaryPassword: plain,
      message: '密码已重置。请把新密码转告用户，并提醒其登录后立即修改',
    };
  }

  async stats(): Promise<{
    total: number;
    pending: number;
    active: number;
    disabled: number;
    admins: number;
    todayNew: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, pending, active, disabled, admins, todayNew] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { status: { not: 'disabled' } } }),
      this.prisma.user.count({ where: { status: 'pending' } }),
      this.prisma.user.count({ where: { status: 'active' } }),
      this.prisma.user.count({ where: { status: 'disabled' } }),
      this.prisma.user.count({ where: { role: 'admin' } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

    return { total, pending, active, disabled, admins, todayNew };
  }

  async remove(id: bigint, operatorId: bigint): Promise<{ success: boolean; message: string }> {
    if (id === operatorId) throw new BadRequestException('不能删除自己的账号');

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { articles: true } } },
    });
    if (!user) throw new NotFoundException('用户不存在');

    // 有文章的用户不允许硬删：articles.author_id 是 ON DELETE RESTRICT，
    // 直接删会抛数据库错误。这里提前给出可操作的提示，而不是让用户看到 500
    if (user._count.articles > 0) {
      throw new ConflictException(
        `该用户还有 ${user._count.articles} 篇文章，无法直接删除。请先转移或删除其文章，或改为「禁用」`,
      );
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true, message: `账号「${user.nickname}」已删除` };
  }

  async findOne(id: bigint): Promise<UserAdminViewDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { articles: { where: { status: { not: 'deleted' } } } } } },
    });
    if (!user) throw new NotFoundException('用户不存在');

    return {
      ...toProfileDto(user),
      email: user.email,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      articleCount: user._count.articles,
    };
  }

  /** 供其他模块使用：确保当前用户是 active 的管理员 */
  async assertAdmin(userId: bigint): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (!user || user.role !== 'admin' || user.status !== 'active') {
      throw new ForbiddenException('需要管理员权限');
    }
  }

  /** 文章模块以外的地方也要按作者统计，这里转发一下 */
  countArticles(authorId: bigint): Promise<number> {
    return this.articles.countByAuthor(authorId);
  }
}

/**
 * 生成一个可读性尚可的随机密码：12 位，保证同时含大小写、数字与符号，
 * 且剔除了容易混淆的字符（0/O、1/l/I），避免管理员转述时念错。
 */
function generateReadablePassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = lower + upper + digits + symbols;

  const pick = (set: string) => set[randomBytes(1)[0] % set.length];

  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  // 洗牌，避免「前四位一定是一小一大一数字一符号」的固定模式
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
