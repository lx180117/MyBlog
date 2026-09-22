import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

/** 免登录接口标记。全局 JwtAuthGuard 遇到 @Public() 直接放行 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export type UserRoleValue = 'admin' | 'author';

export const ROLES_KEY = 'roles';
/** 角色限制。需与 RolesGuard 配合；不写则仅要求登录 */
export const Roles = (...roles: UserRoleValue[]) => SetMetadata(ROLES_KEY, roles);

/**
 * 要求账号处于 active 状态。用于所有**写入**操作。
 * pending（待审核）用户虽然角色已是 author，但不应能发布内容 —— 见 FR-1.2。
 */
export const RequireActive = () => SetMetadata('requireActive', true);

/** JWT 载荷中携带的用户信息，附到 request.user */
export interface JwtPayloadUser {
  id: bigint;
  username: string;
  nickname: string;
  role: UserRoleValue;
  status: 'pending' | 'active' | 'disabled';
}

/**
 * 从请求上下文取当前登录用户。
 * @CurrentUser() user        → 完整用户对象
 * @CurrentUser('id') userId  → 只取 id
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayloadUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser | undefined;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

/** 取真实客户端 IP（Nginx 反代后需信任 X-Forwarded-For，main.ts 里已设置 trust proxy） */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return (request.ip || request.headers['x-forwarded-for'] || '0.0.0.0') as string;
});
