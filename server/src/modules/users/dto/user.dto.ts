import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ArticleListItemDto } from '../../articles/dto/article-response.dto';

export class QueryUserDto extends PaginationDto {
  @ApiPropertyOptional({ description: '账号状态筛选', enum: ['pending', 'active', 'disabled'] })
  @IsOptional()
  @IsIn(['pending', 'active', 'disabled'])
  status?: 'pending' | 'active' | 'disabled';

  @ApiPropertyOptional({ description: '角色筛选', enum: ['admin', 'author'] })
  @IsOptional()
  @IsIn(['admin', 'author'])
  role?: 'admin' | 'author';

  @ApiPropertyOptional({ description: '关键词，匹配用户名 / 昵称 / 邮箱', example: 'zhang' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @ApiPropertyOptional({
    description: '仅看有待审文章的用户',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasArticles?: boolean;

  @ApiPropertyOptional({ description: '注册时间早于该日期（ISO 8601）', example: '2026-09-01' })
  @IsOptional()
  @IsString()
  registeredBefore?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ description: '目标状态', enum: ['pending', 'active', 'disabled'], example: 'active' })
  @IsIn(['pending', 'active', 'disabled'], { message: 'status 取值不合法' })
  status: 'pending' | 'active' | 'disabled';

  @ApiPropertyOptional({ description: '操作备注（仅记录到日志，不入库）', example: '已确认是同事' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ description: '目标角色', enum: ['admin', 'author'], example: 'author' })
  @IsIn(['admin', 'author'], { message: 'role 取值不合法' })
  role: 'admin' | 'author';
}

export class ResetPasswordDto {
  @ApiPropertyOptional({
    description: '新密码。**留空则服务端随机生成一个**，并在响应里返回明文供管理员转告用户',
    example: 'Temp@2026',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码长度不能少于 8 位' })
  @MaxLength(64)
  newPassword?: string;
}

export class ResetPasswordResultDto {
  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiProperty({ description: '生成的新密码明文；管理员需转告用户并提醒尽快修改', example: 'Kx7#mQ2p' })
  temporaryPassword: string;

  @ApiProperty({ description: '提示' })
  message: string;
}

export class AuthorProfileDto {
  @ApiProperty({ description: '用户 ID', example: '2' })
  id: string;

  @ApiProperty({ description: '用户名', example: 'zhangsan' })
  username: string;

  @ApiProperty({ description: '昵称', example: '张三' })
  nickname: string;

  @ApiPropertyOptional({ description: '头像', type: String, nullable: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ description: '简介', type: String, nullable: true })
  bio?: string | null;

  @ApiPropertyOptional({ description: '个人主页', type: String, nullable: true })
  website?: string | null;

  @ApiPropertyOptional({ description: 'GitHub', type: String, nullable: true })
  github?: string | null;

  @ApiProperty({ description: '加入时间' })
  joinedAt: string;

  @ApiProperty({ description: '已发布的文章数', example: 24 })
  articleCount: number;

  @ApiProperty({ description: '累计获得阅读量', example: 15680 })
  totalViews: number;

  @ApiProperty({ description: '累计获得点赞数', example: 320 })
  totalLikes: number;
}

/** 作者主页：资料 + 该作者的文章列表 */
export class AuthorProfilePageDto {
  @ApiProperty({ description: '作者资料', type: AuthorProfileDto })
  author: AuthorProfileDto;

  @ApiProperty({ description: '该作者的文章', type: [ArticleListItemDto] })
  articles: ArticleListItemDto[];

  @ApiProperty({ description: '文章总数' })
  total: number;

  @ApiProperty({ description: '当前页码', example: 1 })
  page: number;

  @ApiProperty({ description: '每页条数', example: 12 })
  pageSize: number;

  @ApiProperty({ description: '总页数', example: 2 })
  totalPages: number;
}

export class UserStatsDto {
  @ApiProperty({ description: '用户总数（不含禁用）', example: 18 })
  total: number;

  @ApiProperty({ description: '待审核', example: 3 })
  pending: number;

  @ApiProperty({ description: '已激活', example: 15 })
  active: number;

  @ApiProperty({ description: '已禁用', example: 0 })
  disabled: number;

  @ApiProperty({ description: '管理员数', example: 1 })
  admins: number;

  @ApiProperty({ description: '今日注册数', example: 1 })
  todayNew: number;
}

export class BulkUserIdsDto {
  @ApiProperty({ description: '用户 ID 列表', example: ['2', '3'], type: [String] })
  ids: string[];

  @ApiProperty({ description: '目标状态', enum: ['pending', 'active', 'disabled'], example: 'active' })
  status: 'pending' | 'active' | 'disabled';
}
