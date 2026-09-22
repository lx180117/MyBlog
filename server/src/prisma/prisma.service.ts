import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService —— 数据库访问入口
 *
 * 两点设计说明：
 * 1. 惰性连接开关：导出 OpenAPI 文档、跑单元测试这类场景不需要数据库，
 *    设置 LAZY_DB_CONNECT=true 可跳过启动时的连接检查（Prisma 本身会在首次
 *    查询时自动连接）。生产环境务必不要开，避免「连不上库却启动成功」。
 * 2. 连接池参数写在 DATABASE_URL 的 connection_limit 里，不在这里硬编码。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    if (process.env.LAZY_DB_CONNECT === 'true') {
      this.logger.warn('LAZY_DB_CONNECT=true，跳过启动时数据库连接检查');
      return;
    }
    await this.$connect();
    this.logger.log('数据库连接已建立');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
