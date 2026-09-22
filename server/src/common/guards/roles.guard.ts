import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, JwtPayloadUser, ROLES_KEY, UserRoleValue } from '../decorators';

export const REQUIRE_ACTIVE_KEY = 'requireActive';

/**
 * 角色守卫。两条独立规则：
 *
 * 1. `@Roles('admin')` —— 角色白名单。用于「只有管理员能做」的操作。
 * 2. `@RequireActive()` —— 账号必须已激活。用于**写操作**。
 *    为什么需要第二条：注册后是 pending 状态，此时角色已经是 author，
 *    如果只校验角色，待审核用户能立刻发文，违背 FR-1.2。
 *    这里把它做成独立装饰器而不是塞进 @Roles，是因为「看自己的空文章列表」
 *    这类只读操作对待审核用户应该放行，只有「写」才拦。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleValue[]>(ROLES_KEY, targets);
    const requireActive = this.reflector.getAllAndOverride<boolean>(REQUIRE_ACTIVE_KEY, targets);

    if (!requiredRoles?.length && !requireActive) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser | undefined;

    if (!user) {
      throw new ForbiddenException('未登录或登录状态已失效');
    }

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('当前角色无权执行此操作');
    }

    if (requireActive && user.status !== 'active') {
      throw new ForbiddenException(
        user.status === 'pending'
          ? '账号正在等待管理员审核，审核通过后才能发布内容'
          : '账号已被禁用，请联系管理员',
      );
    }

    return true;
  }
}
