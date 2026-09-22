import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 分页入参基类。各列表接口继承它并追加自己的筛选字段 */
export class PaginationDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 12, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(50, { message: 'pageSize 最大为 50' })
  @IsOptional()
  pageSize: number = 12;

  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  get take(): number {
    return this.pageSize;
  }
}

/** 分页结果包装（用于生成 Swagger 的泛型基类，不直接实例化） */
export class PaginatedResponseDto<T> {
  @ApiProperty({ description: '当前页数据', isArray: true })
  items: T[];

  @ApiProperty({ description: '符合条件的总条数', example: 128 })
  total: number;

  @ApiProperty({ description: '当前页码', example: 1 })
  page: number;

  @ApiProperty({ description: '每页条数', example: 12 })
  pageSize: number;

  @ApiProperty({ description: '总页数', example: 11 })
  totalPages: number;
}

/** 仅返回总数的简单统计 */
export class CountResponseDto {
  @ApiProperty({ description: '数量', example: 42 })
  count: number;
}
