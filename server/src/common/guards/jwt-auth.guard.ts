import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY, JwtPayloadUser } from '../decorators';

/**
 * 全局 JWT 守卫。
 *
 * 相比直接用 AuthGuard('jwt')，这里多了一个能力：**公开接口的可选认证**。
 * 场景：文章详情页对游客开放，但如果请求带了有效 token，就要顺带告诉前端
 * 「当前用户是否已点赞、是否是文章作者、能不能看到草稿」。若对公开接口一律
 * 不做解析，前端就得再发一次请求问「我是谁」。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isPublic) {
      return (await super.canActivate(context)) as boolean;
    }

    // 公开接口的可选认证：有令牌就交给策略正常解析一次，解析失败静默降级为游客，
    // 绝不因为令牌过期/无效而拒绝访问。
    //
    // 这里**不能**自己 verifyAsync 之后把载荷直接赋给 request.user：令牌载荷里的
    // 用户标识字段是 `sub`，而 JwtPayloadUser 声明的是 `id`。直接赋值会得到一个
    // 「已登录但 id 为 undefined」的用户对象，后果是三处功能静默失效：
    //   ① 作者看不到自己的草稿/定时文章 —— isOwner 判断失败，接口返回 404；
    //   ② 详情页 canEdit 永远是 false，前端「编辑」入口不出现；
    //   ③ 登录用户发评论时 userId 落成 NULL、nickname 也落成 NULL，
    //      直接撞上 DDL 里「游客必有昵称」的 CHECK 约束，接口 500。
    // 交给策略走一遍还能顺带校验账号是否存在、是否被禁用。
    const request = context.switchToHttp().getRequest();
    const raw: string | undefined = request.headers?.authorization;

    if (raw?.startsWith('Bearer ')) {
      try {
        await super.canActivate(context);
      } catch {
        // 令牌无效 / 已过期 / 账号被禁用：按游客处理，而不是拦下请求
        delete request.user;
      }
    }
    return true;
  }

  /**
   * 覆写默认的鉴权失败处理。
   *
   * 不覆写的话，passport 会抛英文的「Unauthorized」，前端拿到的是
   * `{"error":"UnauthorizedException","message":"Unauthorized"}` —— 既不统一也不友好。
   * 这里按失败原因给出可区分的中文提示：过期与无效是两回事，
   * 前端对这两种情况的处理也不同（过期→静默刷新，无效→跳登录页）。
   */
  handleRequest<TUser = JwtPayloadUser>(
    err: Error | null,
    user: TUser | false,
    info: { name?: string; message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      switch (info?.name) {
        case 'TokenExpiredError':
          throw new UnauthorizedException('登录已过期，请重新登录');
        case 'JsonWebTokenError':
          throw new UnauthorizedException('登录凭证无效，请重新登录');
        case 'Error':
          // 通常是 Authorization 头格式不对（少了 Bearer 前缀）
          throw new UnauthorizedException('请求头中的认证信息格式不正确');
        default:
          throw err instanceof Error ? err : new UnauthorizedException('请先登录');
      }
    }
    return user;
  }
}
