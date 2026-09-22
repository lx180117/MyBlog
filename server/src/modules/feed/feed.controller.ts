import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeedService } from './feed.service';
import { Public } from '../../common/decorators';

@ApiTags('订阅与站点地图')
@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Public()
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({
    summary: 'sitemap.xml',
    description: '包含首页、归档页、分类页、标签页、作者主页与全部已发布文章。响应带 1 小时强缓存。',
  })
  sitemap(): Promise<string> {
    return this.feed.buildSitemap();
  }

  @Public()
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'robots.txt', description: '允许抓取全站，排除 /admin 与 /api，并声明 sitemap 位置。' })
  robots(): Promise<string> {
    return this.feed.buildRobots();
  }

  @Public()
  @Get('rss.xml')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=1800')
  @ApiOperation({ summary: 'RSS 2.0 订阅源', description: '默认最新 20 篇，最多 50 篇。正文以 CDATA 形式内嵌。' })
  rss(@Query('limit') limit?: string): Promise<string> {
    return this.feed.buildRss(limit ? Number(limit) : 20);
  }
}
