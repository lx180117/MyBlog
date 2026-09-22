/**
 * 导出静态 openapi.json。
 *
 * 用途：这是 **Step 6 生成前端页面** 的输入文件。把它提交到仓库，好处是
 *   - 前端可以只依赖这个 json 开发，不必先把后端跑起来
 *   - 接口改了会有 git diff，评审时能看出是不是破坏性变更
 *   - CI 里可以跑 openapi-diff 做兼容性检查
 *
 * 用法：npm run openapi:export
 * 注意：本脚本**不需要数据库**（PrismaService 会跳过连接检查），
 *       因为生成文档只依赖装饰器元数据，与真实数据无关。
 */
process.env.LAZY_DB_CONNECT = 'true';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/swagger';
import { configureApp } from '../src/main';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  // 复用线上同一套全局配置，保证导出的文档与实际行为一致
  configureApp(app);
  await app.init();

  const document = buildOpenApiDocument(app);

  const outputPath = resolve(process.cwd(), 'openapi.json');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths).length;
  const operationCount = Object.values(document.paths).reduce(
    (sum, item) => sum + Object.keys(item ?? {}).length,
    0,
  );
  const schemaCount = Object.keys(document.components?.schemas ?? {}).length;

  console.log(`[openapi] 已导出 ${outputPath}`);
  console.log(`[openapi] 路径 ${pathCount} 个，操作 ${operationCount} 个，模型 ${schemaCount} 个`);

  await app.close();
}

exportOpenApi().catch((error) => {
  console.error('[openapi] 导出失败：', error);
  process.exitCode = 1;
});
