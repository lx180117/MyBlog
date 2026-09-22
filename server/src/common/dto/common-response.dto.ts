import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** 操作成功的通用响应（删除、审核等不返回实体时使用） */
export class OperationResultDto {
  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiPropertyOptional({ description: '附带说明', example: '已移入回收站' })
  message?: string;
}

/** 错误响应体（全局异常过滤器统一输出这个结构） */
export class ErrorResponseDto {
  @ApiProperty({ description: 'HTTP 状态码', example: 400 })
  statusCode: number;

  @ApiProperty({ description: '错误简述', example: 'Bad Request' })
  error: string;

  @ApiProperty({
    description: '错误详情；校验失败时为字符串数组',
    example: ['password 长度不能少于 8 位'],
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({ description: '请求路径', example: '/api/v1/articles' })
  path: string;

  @ApiProperty({ description: '发生时间（ISO 8601）', example: '2026-09-17T09:30:00.000Z' })
  timestamp: string;
}

/** 通用 ID 入参（BIGINT 用字符串传输，避免 JS Number 精度丢失） */
export class IdParamDto {
  @ApiProperty({ description: '主键 ID（字符串形式的大整数）', example: '1' })
  @IsString()
  id: string;
}

export class BulkIdsDto {
  @ApiProperty({
    description: 'ID 列表',
    example: ['1', '2', '3'],
    type: [String],
  })
  @IsString({ each: true })
  ids: string[];
}

export class BatchResultDto {
  @ApiProperty({ description: '实际影响条数', example: 3 })
  affected: number;
}

/** 站点级开关，管理端读取的只读投影 */
export class SiteToggleDto {
  @ApiProperty({ description: '是否开放自助注册', example: true })
  @IsBoolean()
  @IsOptional()
  registerEnabled?: boolean;

  @ApiProperty({ description: '评论功能开关', example: true })
  @IsBoolean()
  @IsOptional()
  commentEnabled?: boolean;

  @ApiProperty({ description: '评论是否需要审核', example: true })
  @IsBoolean()
  @IsOptional()
  commentNeedApprove?: boolean;

  @ApiProperty({ description: '是否允许游客评论', example: true })
  @IsBoolean()
  @IsOptional()
  commentAllowGuest?: boolean;

  @ApiPropertyOptional({ description: '站点名称', example: '我的博客' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  siteName?: string;
}
