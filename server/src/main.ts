import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './swagger';

/** 接口统一前缀。改这里就能整体切版本，不用动业务代码 */
export const API_PREFIX = process.env.API_PREFIX || 'api/v1';

/**
 * 全局配置。抽成独立函数，是为了让「导出 OpenAPI 文档」的脚本能复用同一套
 * 中间件与管道配置 —— 否则导出的文档会和线上实际行为不一致。
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(ConfigService);

  // 部署在 Nginx / 负载均衡后面时，要信任代理才能拿到真实客户端 IP。
  // 不设置的话，@Ip() 拿到的永远是 127.0.0.1，点赞去重和评论限流会全体误伤
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  app.setGlobalPrefix(API_PREFIX, {
    // 这几个是给爬虫和监控看的，不该带 API 版本前缀：
    // 爬虫不会去请求 /api/v1/sitemap.xml，容器健康检查也通常配成 /health
    exclude: ['health', 'sitemap.xml', 'robots.txt', 'rss.xml'],
  });

  app.use(
    helmet({
      // 默认策略会让跨域加载本机 /uploads 下的图片被浏览器拦掉，
      // 前后端分端口部署时必踩，这里放开
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // 由前端 SSR 与 Nginx 各自负责，后端纯 JSON 接口不需要
    }),
  );
  app.use(compression());

  const corsOrigins = (config.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    // 没配就只允许同源：**不要**图省事写 origin: true，那等于关闭 CORS 保护
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // 剥掉 DTO 未声明的字段：防止前端塞 role=admin 这类字段被直接透传到
      // Prisma 的 create/update 里（这是很常见的提权路径）
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // 校验失败返回所有错误，前端一次性展示，避免用户来回试
      stopAtFirstError: false,
    }),
  );

  // 上传目录静态托管。生产环境建议交给 Nginx 直接返回文件，这里是为了本地开箱可用
  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads');
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: '/uploads/' });

  return app;
}

/** 在开发环境挂上 Swagger UI。生产环境默认关闭，通过 ENABLE_SWAGGER=true 显式打开 */
export function setupSwaggerUi(app: NestExpressApplication): void {
  const enable = process.env.ENABLE_SWAGGER !== 'false';
  if (!enable) return;

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true },
    customSiteTitle: '博客平台 API 文档',
  });

  // 同时暴露原始 JSON，前端同学可以直接拿去生成 SDK —— 它也是 Step 6 生成前端用的同一个文件。
  //
  // ⚠️ 路径刻意不叫 `docs-json`：swagger-ui-express 自己就占用了
  // `{prefix}/docs-json`，手动再注册一条同名路由会命中它的处理器并返回空响应
  // （表现为 200 但 size=0，很难查）。换个名字从根上避开。
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get(`/${API_PREFIX}/openapi.json`, (_req: unknown, res: { json: (b: unknown) => void }) =>
    res.json(document),
  );
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 生产环境按 NODE_ENV 收紧日志级别
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  configureApp(app);
  setupSwaggerUi(app);

  const port = Number(process.env.PORT) || 3000;
  // 监听 0.0.0.0：只监听 127.0.0.1 的话，Docker 容器外与 Nginx 都连不上
  await app.listen(port, '0.0.0.0');

  logger.log(`服务已启动：http://localhost:${port}/${API_PREFIX}`);
  logger.log(`接口文档：http://localhost:${port}/${API_PREFIX}/docs`);
  logger.log(`健康检查：http://localhost:${port}/health`);
}

// 只在直接执行时才启动，被 import 时不启动（导出文档的脚本会 import 本文件）
if (require.main === module) {
  void bootstrap();
}
