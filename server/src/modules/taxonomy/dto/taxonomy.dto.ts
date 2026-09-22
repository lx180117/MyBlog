import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,49}$/;

export class CreateCategoryDto {
  @ApiProperty({ description: '分类名', example: '后端' })
  @IsString()
  @IsNotEmpty({ message: '分类名不能为空' })
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({
    description: 'URL 标识；留空则根据名称生成。必须是全小写字母/数字/短横线',
    example: 'backend',
  })
  @IsOptional()
  @Matches(SLUG_PATTERN, { message: 'slug 只能包含小写字母、数字和短横线，且不能以短横线开头' })
  slug?: string;

  @ApiPropertyOptional({ description: '分类描述', example: '服务端、数据库、架构相关' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: '排序值，越小越靠前', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryResponseDto {
  @ApiProperty({ description: '分类 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '分类名', example: '后端' })
  name: string;

  @ApiProperty({ description: 'URL 标识', example: 'backend' })
  slug: string;

  @ApiPropertyOptional({ description: '描述', type: String, nullable: true })
  description?: string | null;

  @ApiProperty({ description: '排序值', example: 0 })
  sortOrder: number;

  @ApiProperty({ description: '该分类下已发布的文章数', example: 24 })
  articleCount: number;
}

export class CreateTagDto {
  @ApiProperty({ description: '标签名', example: 'PostgreSQL' })
  @IsString()
  @IsNotEmpty({ message: '标签名不能为空' })
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ description: 'URL 标识；留空自动生成', example: 'postgresql' })
  @IsOptional()
  @Matches(SLUG_PATTERN, { message: 'slug 只能包含小写字母、数字和短横线' })
  slug?: string;
}

export class MergeTagsDto {
  @ApiProperty({
    description: '被合并掉的标签 ID 列表（合并后这些标签会被删除，其文章改挂到目标标签）',
    example: ['3', '7'],
    type: [String],
  })
  sourceTagIds: string[];

  @ApiProperty({ description: '保留的目标标签 ID', example: '1' })
  targetTagId: string;
}

export class TagResponseDto {
  @ApiProperty({ description: '标签 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '标签名', example: 'PostgreSQL' })
  name: string;

  @ApiProperty({ description: 'URL 标识', example: 'postgresql' })
  slug: string;

  @ApiProperty({ description: '关联的文章数', example: 8 })
  articleCount: number;
}
