import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { OverviewDto, SiteSummaryDto, TrendQueryDto } from './dto/stats.dto';
import { Public, Roles } from '../../common/decorators';

@ApiTags('统计')
@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Public()
  @Get('site/summary')
  @ApiOperation({
    summary: '站点概览（公开）',
    description: '文章数、活跃作者数、评论数、累计访问量。适合放在首页侧边栏或关于页。',
  })
  @ApiResponse({ status: 200, description: '概览数据', type: SiteSummaryDto })
  summary() {
    return this.stats.siteSummary();
  }

  @ApiBearerAuth()
  @Get('admin/stats/overview')
  @Roles('admin')
  @ApiOperation({
    summary: '后台仪表盘总览',
    description: [
      '一次请求返回仪表盘需要的全部数据：文章、用户、评论的分布，以及近 N 天的访问/评论/发文趋势。',
      '',
      '**趋势曲线在数据库里聚合**（`DATE_TRUNC` + `generate_series`）：明细表 page_views 是增长最快的表，',
      '把它捞到 Node 里再循环统计，数据量一大就会拖垮接口。用 `generate_series` 补齐空缺日期，',
      '避免前端画折线图时出现断点。',
    ].join('\n'),
  })
  @ApiQuery({ name: 'days', required: false, description: '趋势统计天数，默认 7，最大 90' })
  @ApiResponse({ status: 200, description: '仪表盘数据', type: OverviewDto })
  overview(@Query() query: TrendQueryDto) {
    return this.stats.overview(query.days);
  }
}
