import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  AuthorProfilePageDto,
  QueryUserDto,
  ResetPasswordDto,
  ResetPasswordResultDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  UserStatsDto,
} from './dto/user.dto';
import { UserAdminViewDto, UserProfileDto } from '../auth/dto/auth-response.dto';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiPaginatedResponse } from '../../common/dto/api-paginated.decorator';
import { ErrorResponseDto, OperationResultDto } from '../../common/dto/common-response.dto';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@ApiTags('作者主页 · 前台')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get(':username')
  @ApiOperation({
    summary: '作者主页（公开）',
    description:
      '`/author/{username}` 页面的数据源。一次请求同时返回作者资料（含文章数、累计阅读与点赞）与该作者的文章列表，避免首屏发两次请求。已禁用的账号按 404 处理。',
  })
  @ApiParam({ name: 'username', description: '用户名', example: 'zhangsan' })
  @ApiResponse({ status: 200, description: '作者资料与文章列表', type: AuthorProfilePageDto })
  @ApiResponse({ status: 404, description: '作者不存在', type: ErrorResponseDto })
  findOne(@Param('username') username: string, @Query() query: PaginationDto) {
    return this.users.findAuthorProfile(username, query.page, query.pageSize);
  }
}

@ApiTags('用户管理 · 管理员')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({
    summary: '用户列表',
    description: '待审核的账号排在最前 —— 后台进来第一眼就该看到需要处理的事。',
  })
  @ApiPaginatedResponse(UserAdminViewDto)
  findAll(@Query() query: QueryUserDto) {
    return this.users.findAll(query);
  }

  @Get('stats')
  @Roles('admin')
  @ApiOperation({ summary: '用户统计', description: '总数 / 待审核 / 已激活 / 已禁用 / 管理员数 / 今日注册。' })
  @ApiResponse({ status: 200, description: '统计结果', type: UserStatsDto })
  stats() {
    return this.users.stats();
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: '用户详情' })
  @ApiParam({ name: 'id', example: '2' })
  @ApiResponse({ status: 200, description: '用户详情', type: UserAdminViewDto })
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.users.findOne(id);
  }

  @Patch(':id/status')
  @Roles('admin')
  @ApiOperation({
    summary: '审核 / 启用 / 禁用账号',
    description: [
      '这是多作者模式的核心操作：新注册账号为 `pending`，管理员改为 `active` 后该用户才能发文。',
      '',
      '**服务端有两道防呆**：① 不能禁用自己；② 不能把系统里最后一名启用状态的管理员降级或禁用 ——',
      '否则会把自己锁在系统外面，这是权限系统最经典的自锁场景。',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, description: '更新后的用户资料', type: UserProfileDto })
  @ApiResponse({ status: 400, description: '触发防呆规则', type: ErrorResponseDto })
  updateStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('id') operatorId: bigint,
  ) {
    return this.users.updateStatus(id, dto, operatorId);
  }

  @Patch(':id/role')
  @Roles('admin')
  @ApiOperation({ summary: '调整角色', description: '同样有「不能取消自己的管理员角色」「至少保留一名管理员」两道保护。' })
  @ApiResponse({ status: 200, description: '更新后的用户资料', type: UserProfileDto })
  updateRole(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('id') operatorId: bigint,
  ) {
    return this.users.updateRole(id, dto, operatorId);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({
    summary: '重置用户密码',
    description:
      'v1 不接邮件服务，忘记密码走这条路（FR-1.8）。不传 `newPassword` 时服务端生成一个 12 位随机密码并在响应里返回明文 —— 让管理员自己想密码，往往是「123456」这种。重置后自动清除登录失败锁定。',
  })
  @ApiResponse({ status: 200, description: '重置结果，含临时密码', type: ResetPasswordResultDto })
  resetPassword(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.newPassword);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({
    summary: '删除账号',
    description:
      '仅允许删除**没有文章**的账号 —— `articles.author_id` 是 `ON DELETE RESTRICT`，有文章时直接删会触发数据库错误。此接口会提前给出可读提示，引导改用「禁用」。',
  })
  @ApiResponse({ status: 200, description: '删除成功', type: OperationResultDto })
  @ApiResponse({ status: 409, description: '该用户仍有文章', type: ErrorResponseDto })
  remove(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser('id') operatorId: bigint) {
    return this.users.remove(id, operatorId);
  }
}
