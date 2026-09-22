import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayloadUser, UserRoleValue } from '../../common/decorators';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRoleValue;
}

/**
 * Access Token 校验策略。
 *
 * ⚠️ 这里做了一件「反无状态」的事：每次请求都回查一次数据库。
 *
 * 为什么要付出这个代价：纯 JWT 是无状态的 —— 管理员把某人禁用（或降级）之后，
 * 只要那个人的 token 还没过期，他就**依然能正常发文**。这是无状态鉴权的经典
 * 缺陷，也是很多人上线后才发现的问题。
 *
 * 权衡结果：本项目的规模假设是「作者 ≤ 20 人、1000 PV/日」，一次主键查询的
 * 成本完全可以接受；换来的是「禁用/降级立即生效」。如果日后 QPS 涨上去，
 * 正确的做法是给这一步加 Redis 缓存（key=userId，TTL=30s），而不是删掉这次查询。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // 在构造期就把缺失的密钥暴露出来：否则 passport 会带着 undefined 启动，
    // 直到第一个请求进来才报「invalid signature」，排查时完全不指向配置问题
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('缺少环境变量 JWT_ACCESS_SECRET，服务无法启动（参考 .env.example）');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<JwtPayloadUser> {
    // payload.sub 是字符串（BIGINT 不能用 number 装），这里转回 BigInt 查库
    let userId: bigint;
    try {
      userId = BigInt(payload.sub);
    } catch {
      throw new UnauthorizedException('登录凭证无效');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, nickname: true, role: true, status: true },
    });

    if (!user) throw new UnauthorizedException('账号不存在或已被删除');
    if (user.status === 'disabled') throw new UnauthorizedException('账号已被禁用，请联系管理员');

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role as UserRoleValue,
      status: user.status,
    };
  }
}
