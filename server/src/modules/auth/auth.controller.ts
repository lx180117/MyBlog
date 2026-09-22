import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  Headers,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshTokenDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import {
  CurrentUserResponseDto,
  LoginResponseDto,
  RegisterResponseDto,
  TokenPairDto,
  UserProfileDto,
} from './dto/auth-response.dto';
import { CurrentUser, JwtPayloadUser, Public } from '../../common/decorators';
import { ErrorResponseDto, OperationResultDto } from '../../common/dto/common-response.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  // 注册接口按 IP 限流：防止有人批量刷号把用户表灌满
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: '注册新账号',
    description:
      '开放自助注册。注册成功后账号状态为 `pending`（可登录、可完善资料，但不能发布文章），需管理员在后台审核激活。',
  })
  @ApiResponse({ status: 201, description: '注册成功，直接返回登录令牌', type: RegisterResponseDto })
  @ApiResponse({ status: 409, description: '用户名或邮箱已被占用', type: ErrorResponseDto })
  @ApiResponse({ status: 429, description: '请求过于频繁', type: ErrorResponseDto })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: '登录',
    description:
      '支持用户名或邮箱登录。连续失败 5 次将锁定账号 15 分钟。返回 Access Token（默认 15 分钟）与 Refresh Token（默认 7 天）。',
  })
  @ApiResponse({ status: 200, description: '登录成功，返回用户资料与令牌对', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: '用户名或密码错误', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: '账号被禁用或已锁定', type: ErrorResponseDto })
  // user-agent 只用于登录日志，浏览器会自动带上；必须显式声明 required: false ——
  // 否则 swagger 会因为 @Headers() 把它当成本接口的必填参数（契约与实际不符）
  @ApiHeader({
    name: 'user-agent',
    required: false,
    description: '浏览器信息，仅写入登录日志，无需手动设置',
  })
  login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.auth.login(dto, ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新访问令牌',
    description: 'Access Token 过期后，用 Refresh Token 换取新的令牌对。Refresh Token 自身也必须未过期。',
  })
  @ApiResponse({ status: 200, description: '新的令牌对', type: TokenPairDto })
  @ApiResponse({ status: 401, description: 'Refresh Token 无效或已过期', type: ErrorResponseDto })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取当前登录用户',
    description: '前端启动时调用，用于判断登录态与是否具备发文权限（`canPublish`）。',
  })
  @ApiResponse({ status: 200, description: '当前用户信息', type: CurrentUserResponseDto })
  @ApiResponse({ status: 401, description: '未登录或令牌失效', type: ErrorResponseDto })
  async me(@CurrentUser() user: JwtPayloadUser): Promise<CurrentUserResponseDto> {
    return {
      user: await this.auth.findById(user.id),
      canPublish: user.status === 'active',
    };
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新个人资料', description: '昵称、头像、简介、社交链接与邮箱。' })
  @ApiResponse({ status: 200, description: '更新后的用户资料', type: UserProfileDto })
  updateProfile(@CurrentUser('id') userId: bigint, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(userId, dto);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '修改自己的密码',
    description: '需要提供当前密码。修改成功后旧令牌仍然有效（如需立即失效请重新登录）。',
  })
  @ApiResponse({ status: 200, description: '修改成功', type: OperationResultDto })
  @ApiResponse({ status: 400, description: '当前密码不正确或新密码强度不足', type: ErrorResponseDto })
  changePassword(@CurrentUser('id') userId: bigint, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(userId, dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '登出',
    description:
      'v1 采用无状态 JWT：服务端不维护黑名单，登出由前端丢弃本地令牌实现。此接口存在是为了让前端有个明确的调用点，将来换成「Refresh Token 白名单」时前端无需改动。',
  })
  @ApiResponse({ status: 200, description: '登出成功', type: OperationResultDto })
  logout(): OperationResultDto {
    return { success: true, message: '已登出，请在客户端清除本地令牌' };
  }
}
