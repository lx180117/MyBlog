import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** 文章列表排序方式 */
export const ARTICLE_SORTS = ['latest', 'oldest', 'hot', 'comments'] as const;
export type ArticleSort = (typeof ARTICLE_SORTS)[number];

export class CreateArticleDto {
  @ApiProperty({ description: '标题', example: 'PostgreSQL 中文全文检索的正确姿势', maxLength: 200 })
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(200, { message: '标题最多 200 字' })
  title: string;

  @ApiProperty({
    description: '正文（Markdown 原文）。服务端会渲染成 HTML 并做 XSS 白名单过滤后缓存',
    example: '# 标题\n\n正文内容',
  })
  @IsString()
  @IsNotEmpty({ message: '正文不能为空' })
  content: string;

  @ApiPropertyOptional({ description: '摘要；留空则自动从正文截取前 200 字' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({ description: 'URL 标识；留空则根据标题自动生成（中文保留原字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @ApiPropertyOptional({ description: '封面图地址' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string;

  @ApiPropertyOptional({ description: '分类 ID（只能选用管理员已创建的分类）', example: '1', type: String, nullable: true })
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional({
    description: '标签名数组。不存在的标签会被自动创建（FR-3.2 作者可自由创建标签）',
    example: ['PostgreSQL', '全文检索'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: '单篇文章最多 10 个标签' })
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: '发布状态。draft=存为草稿；published=发布（配合 publishedAt 可做定时发布）',
    enum: ['draft', 'published'],
    default: 'draft',
  })
  @IsOptional()
  @IsIn(['draft', 'published'], { message: 'status 只能是 draft 或 published' })
  status?: 'draft' | 'published';

  @ApiPropertyOptional({
    description:
      '发布时间（ISO 8601）。传未来时间即为「定时发布」——前台在到点前不会展示，到点自动可见，无需定时任务。不传则取当前时间。',
    example: '2026-10-01T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'publishedAt 必须是 ISO 8601 时间字符串' })
  publishedAt?: string;

  @ApiPropertyOptional({ description: '是否置顶（作者可置顶自己的文章）', default: false })
  @IsOptional()
  @IsBoolean()
  isTop?: boolean;
}

/** 更新：所有字段可选 */
export class UpdateArticleDto extends PartialType(CreateArticleDto) {}

export class QueryArticleDto extends PaginationDto {
  @ApiPropertyOptional({
    description: '关键词。标题/摘要走 pg_trgm 三元组索引（对中文有效），正文走 tsvector（对英文有效）',
    example: '数据库',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @ApiPropertyOptional({ description: '按分类 slug 筛选', example: 'backend' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ description: '按分类 ID 筛选', example: '1' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '按标签 slug 筛选', example: 'postgresql' })
  @IsOptional()
  @IsString()
  tagSlug?: string;

  @ApiPropertyOptional({ description: '按作者用户名筛选', example: 'zhangsan' })
  @IsOptional()
  @IsString()
  authorUsername?: string;

  @ApiPropertyOptional({ description: '按年份筛选（归档页用）', example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: '按月份筛选（归档页用，1–12）', example: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  month?: number;

  @ApiPropertyOptional({
    description: '排序：latest=最新发布 / oldest=最早 / hot=按阅读量 / comments=按评论数',
    enum: ARTICLE_SORTS,
    default: 'latest',
  })
  @IsOptional()
  @IsIn(ARTICLE_SORTS as unknown as string[], { message: 'sort 取值不合法' })
  sort?: ArticleSort;
}

/** 作者/管理员查看自己的文章列表时，可额外按状态筛选 */
export class QueryMyArticleDto extends PaginationDto {
  @ApiPropertyOptional({
    description: '状态筛选；不传则返回全部（不含回收站）',
    enum: ['draft', 'published', 'deleted'],
  })
  @IsOptional()
  @IsIn(['draft', 'published', 'deleted'])
  status?: 'draft' | 'published' | 'deleted';

  @ApiPropertyOptional({ description: '关键词（标题模糊匹配）', example: '数据库' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '管理员可按作者筛选', example: 'zhangsan' })
  @IsOptional()
  @IsString()
  authorUsername?: string;

  @ApiPropertyOptional({ description: '仅管理员生效：查看全站所有人的文章', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;
}

export class PublishArticleDto {
  @ApiPropertyOptional({
    description: '发布时间；传未来时间即为定时发布。不传则立即发布',
    example: '2026-10-01T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  publishedAt?: string;
}

export class ToggleTopDto {
  @ApiProperty({ description: '是否置顶', example: true })
  @IsBoolean()
  isTop: boolean;
}
