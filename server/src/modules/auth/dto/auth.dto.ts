import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 用户名规则与数据库 CHECK 约束保持一致：^[a-z0-9][a-z0-9_-]{2,49}$ */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,49}$/;

export class RegisterDto {
  @ApiProperty({
    description: '用户名：全小写，仅允许字母/数字/短横线/下划线，3–50 位，同时作为作者主页地址',
    example: 'zhangsan',
    pattern: USERNAME_PATTERN.source,
  })
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message: '用户名只能包含小写字母、数字、- 和 _，且必须以字母或数字开头，长度 3–50 位',
  })
  username: string;

  @ApiProperty({ description: '邮箱，用于登录与站内通知', example: 'zhangsan@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: '密码：至少 8 位，且同时包含字母与数字', example: 'Passw0rd123' })
  @IsString()
  @MinLength(8, { message: '密码长度不能少于 8 位' })
  @MaxLength(64, { message: '密码长度不能超过 64 位' })
  password: string;

  @ApiProperty({ description: '昵称：展示用，支持中文', example: '张三' })
  @IsString()
  @IsNotEmpty({ message: '昵称不能为空' })
  @MaxLength(50)
  nickname: string;
}

export class LoginDto {
  @ApiProperty({ description: '用户名或邮箱', example: 'admin' })
  @IsString()
  @IsNotEmpty({ message: '请输入用户名或邮箱' })
  account: string;

  @ApiProperty({ description: '密码', example: 'Admin@123456' })
  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: '登录时下发的 refreshToken' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码', example: 'Passw0rd123' })
  @IsString()
  @IsNotEmpty({ message: '请输入当前密码' })
  oldPassword: string;

  @ApiProperty({ description: '新密码：至少 8 位，且同时包含字母与数字', example: 'NewPassw0rd' })
  @IsString()
  @MinLength(8, { message: '新密码长度不能少于 8 位' })
  @MaxLength(64)
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '昵称', example: '张三' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ description: '头像地址', example: 'https://cdn.example.com/a.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ description: '个人简介，最多 500 字', example: '后端工程师，写点数据库和分布式' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ description: '个人主页', example: 'https://example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ description: 'GitHub 账号或主页', example: 'https://github.com/zhangsan' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  github?: string;

  @ApiPropertyOptional({ description: '邮箱（修改后不影响登录，登录名仍是用户名）', example: 'new@example.com' })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;
}
