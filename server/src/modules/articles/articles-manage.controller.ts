import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArticlesService } from './articles.service';
import {
  CreateArticleDto,
  PublishArticleDto,
  QueryMyArticleDto,
  ToggleTopDto,
  UpdateArticleDto,
} from './dto/article.dto';
import {
  ArticleListItemDto,
  ArticleManageDto,
  ArticleStatsDto,
} from './dto/article-response.dto';
import { CurrentUser, JwtPayloadUser, RequireActive, Roles } from '../../common/decorators';
import { ApiPaginatedResponse } from '../../common/dto/api-paginated.decorator';
import { ErrorResponseDto, OperationResultDto } from '../../common/dto/common-response.dto';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

/**
 * 作者工作台 —— 注意路径用 `/me/articles` 而不是 `/articles/mine`。
 *
 * 原因是个真实的坑：如果管理接口挂在 `/articles/xxx` 下，就会和前台详情路由
 * `/articles/:slug` 争抢匹配。虽然可以把「具体路径写在参数路由之前」来绕开，
 * 但那种顺序依赖一旦有人在中间插一条路由就会静默失效（mine 被当成 slug，返回 404）。
 * 用**不同前缀**从根上避免这类问题。
 */
@ApiTags('文章 · 作者工作台')
@ApiBearerAuth()
@Controller('me/articles')
export class MeArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @ApiOperation({
    summary: '我的文章列表',
    description: '默认不含回收站。管理员带 `all=true` 可查看全站文章（作者传该参数无效）。',
  })
  @ApiPaginatedResponse(ArticleManageDto)
  findMine(@Query() query: QueryMyArticleDto, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.findMine(query, user);
  }

  @Get('stats')
  @ApiOperation({ summary: '我的文章统计', description: '文章总数 / 已发布 / 草稿 / 回收站 / 定时中。' })
  @ApiResponse({ status: 200, description: '统计结果', type: ArticleStatsDto })
  stats() {
    return this.articles.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: '取文章原始内容（编辑器回填）', description: '草稿也可以取到，仅限作者本人与管理员。' })
  @ApiParam({ name: 'id', example: '10' })
  @ApiResponse({ status: 200, description: '文章管理视图', type: ArticleManageDto })
  @ApiResponse({ status: 403, description: '不是自己的文章', type: ErrorResponseDto })
  findOne(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.findForEdit(id, user);
  }

  @Post()
  @RequireActive()
  @Roles('author', 'admin')
  @ApiOperation({
    summary: '新建文章',
    description: [
      '**需要账号已激活**（`status=active`）。待审核用户调用会得到 403 —— 见 FR-1.2。',
      '',
      '几个自动处理：`slug` 留空则根据标题自动生成（中文保留原字，重名自动加序号）；',
      '`summary` 留空则从正文自动截取前 200 字；`content_html` 在服务端渲染并做 XSS 白名单过滤后缓存。',
    ].join('\n'),
  })
  @ApiResponse({ status: 201, description: '创建成功', type: ArticleManageDto })
  @ApiResponse({ status: 403, description: '账号未激活或角色不足', type: ErrorResponseDto })
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.create(dto, user);
  }

  @Patch(':id')
  @RequireActive()
  @Roles('author', 'admin')
  @ApiOperation({ summary: '更新文章', description: '仅作者本人或管理员。正文变更会同步重算 HTML 缓存与摘要。' })
  @ApiResponse({ status: 200, description: '更新成功', type: ArticleManageDto })
  @ApiResponse({ status: 403, description: '无权操作他人的文章', type: ErrorResponseDto })
  update(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: UpdateArticleDto, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.update(id, dto, user);
  }

  @Patch(':id/publish')
  @RequireActive()
  @Roles('author', 'admin')
  @ApiOperation({
    summary: '发布文章',
    description: '可传未来时间实现定时发布 —— 前台用「发布时间 ≤ 当前时间」过滤，到点自动可见。',
  })
  @ApiResponse({ status: 200, description: '发布成功', type: ArticleManageDto })
  publish(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: PublishArticleDto, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.publish(id, dto.publishedAt, user);
  }

  @Patch(':id/unpublish')
  @RequireActive()
  @Roles('author', 'admin')
  @ApiOperation({ summary: '撤回为草稿', description: '已发布的文章退回草稿状态，前台立即不可见。' })
  @ApiResponse({ status: 200, description: '操作成功', type: ArticleManageDto })
  unpublish(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.unpublish(id, user);
  }

  @Patch(':id/top')
  @RequireActive()
  @Roles('author', 'admin')
  @ApiOperation({ summary: '设置/取消置顶', description: '置顶文章在列表里排在前面。' })
  @ApiResponse({ status: 200, description: '操作成功', type: ArticleManageDto })
  toggleTop(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: ToggleTopDto, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.toggleTop(id, dto.isTop, user);
  }

  @Delete(':id')
  @RequireActive()
  @Roles('author', 'admin')
  @ApiOperation({
    summary: '删除文章（移入回收站）',
    description: '软删除，数据仍在库里，`status` 变为 `deleted` 并记录 `deletedAt`，可随时恢复。',
  })
  @ApiResponse({ status: 200, description: '已移入回收站', type: OperationResultDto })
  remove(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.softDelete(id, user);
  }

  @Post(':id/restore')
  @RequireActive()
  @Roles('author', 'admin')
  @ApiOperation({ summary: '从回收站恢复', description: '恢复后状态回到 `draft`，需要重新发布。' })
  @ApiResponse({ status: 200, description: '恢复成功', type: ArticleManageDto })
  @ApiResponse({ status: 400, description: '该文章不在回收站', type: ErrorResponseDto })
  restore(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.restore(id, user);
  }
}

@ApiTags('文章 · 管理员')
@ApiBearerAuth()
@Controller('admin/articles')
export class AdminArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: '全站文章列表（管理员）', description: '可按作者、状态筛选。' })
  @ApiPaginatedResponse(ArticleManageDto)
  findAll(@Query() query: QueryMyArticleDto, @CurrentUser() user: JwtPayloadUser) {
    return this.articles.findMine({ ...query, all: true }, user);
  }

  @Delete(':id/purge')
  @Roles('admin')
  @ApiOperation({
    summary: '彻底删除（管理员）',
    description: '物理删除，不可恢复。关联的评论、点赞、阅读记录由外键 `ON DELETE CASCADE` 一并清理。',
  })
  @ApiResponse({ status: 200, description: '已彻底删除', type: OperationResultDto })
  purge(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.articles.purge(id);
  }
}

/** 保留导出，便于前端按需引用列表项结构 */
export type { ArticleListItemDto };
