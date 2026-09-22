import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './common/decorators';

@ApiTags('系统')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  @ApiOperation({
    summary: '健康检查',
    description:
      '同时探测进程与数据库连通性。返回 503（通过 database 字段体现）时说明服务活着但数据库不可用 —— 负载均衡与容器编排需要能区分这两种状态。',
  })
  async health(): Promise<{
    status: string;
    uptime: number;
    version: string;
    database: string;
    timestamp: string;
  }> {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '1.0.0',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
