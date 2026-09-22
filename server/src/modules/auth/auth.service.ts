import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import { LoginResponseDto, TokenPairDto, UserProfileDto } from './dto/auth-response.dto';

/** 登录失败达到该次数后锁定账号，抵御在线暴力破解（FR-1.7） */
const MAX_LOGIN_FAILURES = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly password: PasswordService,
  ) {}

  // ---------------------------------------------------------------- 注册
  async register(dto: RegisterDto): Promise<{ message: string; data: LoginResponseDto }> {
    const strengthError = this.password.validateStrength(dto.password);
    if (strengthError) throw new BadRequestException(strengthError);

    const [usernameTaken, emailTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: dto.username }, select: { id: true } }),
      this.prisma.user.findFirst({
        where: { email: { equals: dto.email, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);

    if (usernameTaken) throw new ConflictException('该用户名已被占用，请换一个');
    if (emailTaken) throw new ConflictException('该邮箱已被注册');

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        nickname: dto.nickname,
        passwordHash: await this.password.hash(dto.password),
        // 角色给 author，但状态是 pending：能登录、能进后台，但不能发文。
        // 见 FR-1.2 —— 由 RolesGuard 的 @RequireActive 统一拦截。
        role: 'author',
        status: 'pending',
      },
    });

    return {
      message: '注册成功，账号需要管理员审核通过后才能发布文章',
      data: { user: toProfileDto(user), tokens: await this.issueTokens(user) },
    };
  }

  // ---------------------------------------------------------------- 登录
  async login(dto: LoginDto, ip: string, userAgent?: string): Promise<LoginResponseDto> {
    const account = dto.account.trim();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: account.toLowerCase() },
          { email: { equals: account, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      // 刻意在此做一次等价开销的哈希运算：否则「用户不存在」会比「密码错误」
      // 快上百倍（scrypt 很慢），攻击者就能靠响应时间枚举出哪些用户名是真实存在的
      await this.password.verify(dto.password, await this.password.hash('dummy'));
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(`登录失败次数过多，账号已锁定，请 ${minutes} 分钟后再试`);
    }

    if (user.status === 'disabled') {
      throw new ForbiddenException('账号已被禁用，请联系管理员');
    }

    const ok = await this.password.verify(dto.password, user.passwordHash);
    if (!ok) {
      await this.onLoginFailed(user);
      throw new UnauthorizedException('用户名或密码错误');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginFailCount: 0,
        lockedUntil: null,
      },
    });

    void ip;
    void userAgent;
    return { user: toProfileDto(updated), tokens: await this.issueTokens(updated) };
  }

  private async onLoginFailed(user: User): Promise<void> {
    const nextCount = user.loginFailCount + 1;
    const shouldLock = nextCount >= MAX_LOGIN_FAILURES;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginFailCount: nextCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
  }

  // ---------------------------------------------------------------- 刷新令牌
  async refresh(refreshToken: string): Promise<TokenPairDto> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
    });
    if (!user || user.status === 'disabled') {
      throw new UnauthorizedException('账号不可用，请重新登录');
    }

    return this.issueTokens(user);
  }

  // ---------------------------------------------------------------- 当前用户
  async findById(id: bigint): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return toProfileDto(user);
  }

  // ---------------------------------------------------------------- 资料维护
  async updateProfile(userId: bigint, dto: UpdateProfileDto): Promise<UserProfileDto> {
    if (dto.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: { equals: dto.email, mode: 'insensitive' }, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('该邮箱已被其他账号使用');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: dto.nickname,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
        website: dto.website,
        github: dto.github,
        email: dto.email,
      },
    });
    return toProfileDto(user);
  }

  async changePassword(userId: bigint, dto: ChangePasswordDto): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const ok = await this.password.verify(dto.oldPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('当前密码不正确');

    const strengthError = this.password.validateStrength(dto.newPassword);
    if (strengthError) throw new BadRequestException(strengthError);

    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.password.hash(dto.newPassword) },
    });

    return { success: true, message: '密码已修改，请使用新密码重新登录' };
  }

  // ---------------------------------------------------------------- 内部
  private async issueTokens(user: User): Promise<TokenPairDto> {
    const payload = { sub: user.id.toString(), username: user.username, role: user.role };

    // 把 '15m' / '7d' 这类写法统一解析成秒再传给 jsonwebtoken：
    // 一是类型上更明确（SignOptions.expiresIn 的字符串形式是模板字面量类型，
    // 从环境变量读出来的 string 无法直接赋值），二是这个秒数前端还要用来做续期倒计时
    const accessExpiresIn = parseDurationToSeconds(
      this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    );
    const refreshExpiresIn = parseDurationToSeconds(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    return { accessToken, refreshToken, expiresIn: accessExpiresIn };
  }
}

/** '15m' / '7d' / '900' → 秒。仅用于前端展示「还有多久过期」 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])?$/.exec(value);
  if (!match) return 900;
  const n = Number(match[1]);
  switch (match[2]) {
    case 'd':
      return n * 86400;
    case 'h':
      return n * 3600;
    case 'm':
      return n * 60;
    default:
      return n;
  }
}

/** 实体 → DTO。集中在一处，避免各个 service 各写一份导致字段泄露 */
export function toProfileDto(user: User): UserProfileDto {
  return {
    id: user.id.toString(),
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    website: user.website,
    github: user.github,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Prisma 错误类型透出，供上层 catch 使用（避免各处重复 import） */
export type { Prisma };
