import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ArticleStatsDto } from '../../articles/dto/article-response.dto';
import { CommentStatsDto } from '../../comments/dto/comment-response.dto';
import { UserStatsDto } from '../../users/dto/user.dto';

export class TrendQueryDto {
  @ApiPropertyOptional({ description: '统计最近多少天（1–90）', default: 7, minimum: 1, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days: number = 7;
}

/** 趋势曲线上的一天。空缺的日期由 SQL 的 generate_series 补 0，不会断点。 */
export class TrendPointDto {
  @ApiProperty({ description: '日期（YYYY-MM-DD）', example: '2026-09-17' })
  date: string;

  @ApiProperty({ description: '当日访问量', example: 342 })
  views: number;

  @ApiProperty({ description: '当日新增评论数', example: 6 })
  comments: number;

  @ApiProperty({ description: '当日发文数（按发布时间归集）', example: 2 })
  articles: number;
}

/** 站点概览（公开） */
export class SiteSummaryDto {
  @ApiProperty({ description: '已发布文章数', example: 128 })
  articleCount: number;

  @ApiProperty({ description: '活跃作者数（有已发布文章的作者）', example: 7 })
  authorCount: number;

  @ApiProperty({ description: '已通过的评论数', example: 320 })
  commentCount: number;

  @ApiProperty({ description: '累计访问量', example: 45680 })
  viewCount: number;
}

/** 访问量汇总 */
export class ViewsSummaryDto {
  @ApiProperty({ description: '累计访问量', example: 45680 })
  total: number;

  @ApiProperty({ description: '今日访问量', example: 342 })
  today: number;

  @ApiProperty({ description: '近 7 天访问量', example: 2130 })
  last7Days: number;
}

/** 后台仪表盘总览 */
export class OverviewDto {
  @ApiProperty({ description: '文章统计', type: ArticleStatsDto })
  articles: ArticleStatsDto;

  @ApiProperty({ description: '用户统计', type: UserStatsDto })
  users: UserStatsDto;

  @ApiProperty({ description: '评论统计', type: CommentStatsDto })
  comments: CommentStatsDto;

  @ApiProperty({ description: '访问量汇总', type: ViewsSummaryDto })
  views: ViewsSummaryDto;

  @ApiProperty({ description: '近 N 天的趋势曲线', type: [TrendPointDto] })
  trend: TrendPointDto[];
}
