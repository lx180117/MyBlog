import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArticlesService } from './articles.service';
import { QueryArticleDto } from './dto/article.dto';
import {
  ArchiveItemDto,
  ArticleDetailDto,
  ArticleListItemDto,
  LikeResultDto,
  ViewResultDto,
} from './dto/article-response.dto';
import { CurrentUser, JwtPayloadUser, Public } from '../../common/decorators';
import { ErrorResponseDto } from '../../common/dto/common-response.dto';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@ApiTags('文章 · 前台')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '文章列表（公开）',
    description: [
      '前台首页与各筛选页共用的接口。只返回 `status=published` 且**发布时间已到**的文章，',
      '所以「定时发布」的文章在到点前不会出现在这里，无需任何定时任务。',
      '',
      '**关键词搜索的实现说明**：标题与摘要走 `pg_trgm` 三元组索引（`ILIKE`，对中文有效），',
      '正文走 `tsvector`（对英文有效），两者取并集后按 `ts_rank` 排序。',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, description: '分页文章列表' })
  list(@Query() query: QueryArticleDto) {
    return this.articles.findPublished(query);
  }

  // ⚠️ 必须声明在 :slug 之前，否则 /articles/archives 会被当成 slug=archives
  @Public()
  @Get('archives')
  @ApiOperation({
    summary: '按年月归档',
    description: '归档页数据。年月聚合在数据库里完成（`EXTRACT` + `GROUP BY`），不把全表拉到内存。',
  })
  @ApiResponse({ status: 200, description: '归档分组列表', type: [ArchiveItemDto] })
  archives(@Query() query: QueryArticleDto) {
    return this.articles.findArchives(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: '文章详情（公开）',
    description: [
      '支持**可选认证**：带有效 Token 时会在响应里回填 `likedByMe`（配合 IP 判断）与 `canEdit`，',
      '前端无需再发一次「我是谁」的请求。',
      '',
      '草稿与未到发布时间的文章只有作者本人和管理员可见，其他人一律得到 404（不是 403 —— ',
      '用 403 会暴露「这个 slug 确实存在」这一信息）。',
    ].join('\n'),
  })
  @ApiParam({ name: 'slug', description: '文章 URL 标识', example: 'postgresql-中文全文检索' })
  @ApiResponse({ status: 200, description: '文章详情', type: ArticleDetailDto })
  @ApiResponse({ status: 404, description: '文章不存在或尚未发布', type: ErrorResponseDto })
  detail(
    @Param('slug') slug: string,
    @CurrentUser() user?: JwtPayloadUser,
    @Ip() ip?: string,
  ): Promise<ArticleDetailDto> {
    return this.articles.findBySlug(slug, user, ip);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: '上报阅读量',
    description:
      '同 IP 对同一篇文章 10 分钟内只计一次，防止刷新刷量。重复上报返回当前值且不报错（幂等）。',
  })
  @ApiResponse({ status: 200, description: '当前累计阅读量', type: ViewResultDto })
  view(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @CurrentUser() user?: JwtPayloadUser,
  ) {
    return this.articles.recordView(id, ip, userAgent, user?.id);
  }

  @Public()
  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '点赞',
    description:
      '按 **IP + 文章** 去重（`article_likes` 表的唯一约束）。重复点赞是幂等的，返回 `changed=false`。',
  })
  @ApiResponse({ status: 200, description: '点赞结果', type: LikeResultDto })
  like(@Param('id', ParseBigIntPipe) id: bigint, @Ip() ip: string, @CurrentUser() user?: JwtPayloadUser) {
    return this.articles.like(id, ip, user?.id);
  }

  @Public()
  @Delete(':id/like')
  @ApiOperation({
    summary: '取消点赞',
    description: '取消当前 IP 的点赞记录。未点过赞时返回 `changed=false`，不报错。',
  })
  @ApiResponse({ status: 200, description: '取消结果', type: LikeResultDto })
  unlike(@Param('id', ParseBigIntPipe) id: bigint, @Ip() ip: string) {
    return this.articles.unlike(id, ip);
  }
}

/** 供 OpenAPI 文档展示列表响应结构 */
export class ArticleListResponseDto {
  items: ArticleListItemDto[];
}
