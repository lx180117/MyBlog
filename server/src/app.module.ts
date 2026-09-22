import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';
import { CommentsModule } from './modules/comments/comments.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UploadModule } from './modules/upload/upload.module';
import { StatsModule } from './modules/stats/stats.module';
import { FeedModule } from './modules/feed/feed.module';
import { HealthController } from './health.controller';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SerializeInterceptor } from './common/interceptors/serialize.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    // .env.local 优先于 .env，便于本地覆盖而不影响团队共享的配置
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),

    // 全局限流兜底：单 IP 每分钟 120 次。各敏感接口（登录、注册、评论）
    // 用 @Throttle 单独收紧，这里只防「有人拿脚本扫接口」
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    ArticlesModule,
    TaxonomyModule,
    CommentsModule,
    UploadModule,
    StatsModule,
    FeedModule,
  ],
  controllers: [HealthController],
  providers: [
    // ⚠️ Guard 的执行顺序 = 这里的注册顺序，不能随意调整：
    //    JwtAuthGuard  先跑，负责解析 token 并把用户挂到 request.user
    //    RolesGuard    后跑，读取 request.user 做角色与状态判断
    //    ThrottlerGuard 最后，前两者都不通过时就不必再占用限流计数
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 拦截器负责把 BigInt 转成字符串，避免 JSON.stringify 直接抛异常
    { provide: APP_INTERCEPTOR, useClass: SerializeInterceptor },
  ],
})
export class AppModule {}
