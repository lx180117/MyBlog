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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CommentsService } from './comments.service';
import { BatchModerateDto, CreateCommentDto, QueryCommentDto } from './dto/comment.dto';
import {
  BatchModerateResultDto,
  CommentAdminViewDto,
  CommentPageDto,
  CommentStatsDto,
  CreateCommentResultDto,
} from './dto/comment-response.dto';
import { CurrentUser, JwtPayloadUser, Public, RequireActive, Roles } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiPaginatedResponse } from '../../common/dto/api-paginated.decorator';
import { ErrorResponseDto, OperationResultDto } from '../../common/dto/common-response.dto';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@ApiTags('评论 · 前台')
@Controller('articles/:articleId/comments')
export class ArticleCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '文章评论列表（公开）',
    description:
      '只返回 **已通过审核** 的评论。分页对象是顶级评论，每条顶级评论的回复一并返回（两级结构）。',
  })
  @ApiParam({ name: 'articleId', description: '文章 ID', example: '10' })
  @ApiResponse({ status: 200, description: '评论分页结果', type: CommentPageDto })
  list(@Param('articleId', ParseBigIntPipe) articleId: bigint, @Query() query: PaginationDto) {
    return this.comments.findForArticle(articleId, query.page, query.pageSize);
  }

  @Public()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: '提交评论（登录用户或游客）',
    description: [
      '登录用户自动关联账号（昵称、头像取自资料）；游客必须填 `nickname`。',
      '',
      '**服务端会做三件事**：① 同一 IP 60 秒内只能发一条；② 命中敏感词的内容强制进入待审核；',
      '③ 如果站点开启了「评论需审核」，一律先入库为 `pending`。',
      '',
      '两级限制由**数据库触发器**兜底：回复的回复会被直接拒绝，即使绕过本接口直连数据库也拦得住。',
    ].join('\n'),
  })
  @ApiResponse({ status: 201, description: '提交结果', type: CreateCommentResultDto })
  @ApiResponse({ status: 400, description: '内容为空、缺昵称或频率过高', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: '评论功能已关闭或需登录', type: ErrorResponseDto })
  // 同 login：user-agent 只是留痕，浏览器自动带，显式标为可选以免契约失真
  @ApiHeader({
    name: 'user-agent',
    required: false,
    description: '浏览器信息，仅写入评论记录，无需手动设置',
  })
  create(
    @Param('articleId', ParseBigIntPipe) articleId: bigint,
    @Body() dto: CreateCommentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @CurrentUser() user?: JwtPayloadUser,
  ) {
    return this.comments.create(articleId, dto, user, ip, userAgent);
  }
}

/**
 * 评论审核台。
 * `/admin/comments` 只有管理员能进；作者用 `/me/comments` —— 服务层会自动把
 * 查询范围限制到「自己文章下的评论」，不依赖前端传参。
 */
@ApiTags('评论 · 审核')
@ApiBearerAuth()
@Controller('admin/comments')
export class AdminCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @Roles('admin', 'author')
  @ApiOperation({
    summary: '评论列表（作者看自己的，管理员看全部）',
    description: '默认把待审核的排在前面，方便快速处理。',
  })
  @ApiPaginatedResponse(CommentAdminViewDto)
  findAll(@Query() query: QueryCommentDto, @CurrentUser() user: JwtPayloadUser) {
    return this.comments.findAll(query, user);
  }

  @Get('stats')
  @Roles('admin', 'author')
  @ApiOperation({ summary: '评论统计', description: '待审核 / 已通过 / 已拒绝 / 今日新增。' })
  @ApiResponse({ status: 200, description: '统计结果', type: CommentStatsDto })
  stats() {
    return this.comments.stats();
  }

  @Patch(':id/approve')
  @RequireActive()
  @Roles('admin', 'author')
  @ApiOperation({
    summary: '通过审核',
    description: '通过后立即出现在前台，文章的 `comment_count` 由数据库触发器自动重算，无需手工维护。',
  })
  @ApiResponse({ status: 200, description: '操作成功', type: OperationResultDto })
  @ApiResponse({ status: 403, description: '不是自己文章下的评论', type: ErrorResponseDto })
  approve(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: JwtPayloadUser) {
    return this.comments.moderate(id, 'approve', user);
  }

  @Patch(':id/reject')
  @RequireActive()
  @Roles('admin', 'author')
  @ApiOperation({ summary: '拒绝审核', description: '拒绝后前台不再展示，数据保留可随时改回通过。' })
  @ApiResponse({ status: 200, description: '操作成功', type: OperationResultDto })
  reject(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: JwtPayloadUser) {
    return this.comments.moderate(id, 'reject', user);
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @RequireActive()
  @Roles('admin', 'author')
  @ApiOperation({
    summary: '批量审核 / 删除',
    description:
      '单次最多 100 条。**每条都会单独校验归属** —— 批量接口最容易成为越权入口，只校验「有权限」而不校验「每条都有权限」会漏。',
  })
  @ApiResponse({ status: 200, description: '批量处理结果', type: BatchModerateResultDto })
  batch(@Body() dto: BatchModerateDto, @CurrentUser() user: JwtPayloadUser) {
    return this.comments.batchModerate(dto, user);
  }

  @Delete(':id')
  @RequireActive()
  @Roles('admin', 'author')
  @ApiOperation({ summary: '删除评论', description: '删除顶级评论时，其下的回复由外键级联一并删除。' })
  @ApiResponse({ status: 200, description: '删除成功', type: OperationResultDto })
  remove(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: JwtPayloadUser) {
    return this.comments.remove(id, user);
  }
}

@ApiTags('评论 · 作者工作台')
@ApiBearerAuth()
@Controller('me/comments')
export class MeCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @Roles('author', 'admin')
  @ApiOperation({
    summary: '我文章下的评论',
    description: '只返回**自己的文章**下的评论，服务端强制过滤，不取决于前端传参。',
  })
  @ApiPaginatedResponse(CommentAdminViewDto)
  findAll(@Query() query: QueryCommentDto, @CurrentUser() user: JwtPayloadUser) {
    return this.comments.findAll(query, user);
  }
}
