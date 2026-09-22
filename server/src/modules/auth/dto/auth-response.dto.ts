import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 对外暴露的用户资料（公开部分，任何人都能看到） */
export class UserProfileDto {
  @ApiProperty({ description: '用户 ID（字符串形式，避免 JS 大整数精度丢失）', example: '1' })
  id: string;

  @ApiProperty({ description: '用户名，作者主页路径 /author/{username}', example: 'zhangsan' })
  username: string;

  @ApiProperty({ description: '昵称', example: '张三' })
  nickname: string;

  /**
   * 邮箱。
   *
   * 加这个字段是为了让「个人资料」页能回填当前邮箱 —— 没有它，前端只能给一个
   * 空白输入框配一句「留空则不修改」，作者根本看不到自己填过什么。
   *
   * 安全性：`toProfileDto` 只用于**本人**的响应（登录 / 注册 / GET /auth/me /
   * 改资料）以及管理员改他人状态后的回显。公开的作者主页走的是另一个
   * `AuthorProfileDto`，不含邮箱，所以这里不会造成邮箱外泄。
   */
  @ApiProperty({ description: '邮箱（仅本人与管理员可见）', example: 'zhangsan@example.com' })
  email: string;

  @ApiPropertyOptional({ description: '头像地址', type: String, nullable: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ description: '个人简介', type: String, nullable: true })
  bio?: string | null;

  @ApiPropertyOptional({ description: '个人主页', type: String, nullable: true })
  website?: string | null;

  @ApiPropertyOptional({ description: 'GitHub 链接', type: String, nullable: true })
  github?: string | null;

  @ApiProperty({ description: '角色', enum: ['admin', 'author'], example: 'author' })
  role: string;

  @ApiProperty({ description: '账号状态', enum: ['pending', 'active', 'disabled'], example: 'active' })
  status: string;

  @ApiProperty({ description: '注册时间', example: '2026-09-17T09:00:00.000Z' })
  createdAt: string;
}

/**
 * 管理员视角的用户详情（多出登录信息与文章数）。
 *
 * 注意：`email` 现在由基类 UserProfileDto 提供，这里**不能再声明一次** ——
 * 子类重复声明基类属性是 TS2612 错误（"will overwrite the base property"），
 * 而且会让 Swagger 里出现两份同名字段的描述，字段说明迟早会不一致。
 */
export class UserAdminViewDto extends UserProfileDto {
  @ApiPropertyOptional({ description: '最近登录时间', type: String, nullable: true })
  lastLoginAt?: string | null;

  @ApiProperty({ description: '该用户的文章总数', example: 12 })
  articleCount: number;
}

/** 双 Token 对 */
export class TokenPairDto {
  @ApiProperty({ description: '访问令牌，放入 Authorization: Bearer <token>', example: 'eyJhbGciOi...' })
  accessToken: string;

  @ApiProperty({ description: '刷新令牌，accessToken 过期后用 /auth/refresh 换新的' })
  refreshToken: string;

  @ApiProperty({ description: 'accessToken 有效期（秒）', example: 900 })
  expiresIn: number;
}

export class LoginResponseDto {
  @ApiProperty({ description: '当前登录用户资料', type: UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ description: '令牌对', type: TokenPairDto })
  tokens: TokenPairDto;
}

export class RegisterResponseDto {
  @ApiProperty({ description: '注册结果提示' })
  message: string;

  @ApiProperty({ description: '新账号（状态为 pending，需管理员审核后激活）', type: LoginResponseDto })
  data: LoginResponseDto;
}

export class CurrentUserResponseDto {
  @ApiProperty({ description: '当前登录用户', type: UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ description: '账号已激活，可发布文章', example: true })
  canPublish: boolean;
}
