import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { ErrorResponseDto } from './common/dto/common-response.dto';

/**
 * OpenAPI 文档配置。
 *
 * 这个文件被两处复用：
 *  1. `main.ts` —— 开发环境在 /api/docs 提供 Swagger UI
 *  2. `scripts/export-openapi.ts` —— 导出静态 openapi.json，作为 **Step 6 生成前端**的输入
 * 抽出来是为了保证「界面上看到的」与「导出的 json」永远一致。
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('博客平台 API')
    .setDescription(
      [
        '多作者博客平台后端接口。',
        '',
        '## 认证方式',
        '登录后拿到 `accessToken`，在请求头带上 `Authorization: Bearer <token>`。',
        'Access Token 默认 15 分钟过期，用 `POST /auth/refresh` 换成新的令牌对。',
        '',
        '## 关于 ID',
        '所有主键在数据库里是 `BIGINT`，接口统一以**字符串**收发 ——',
        'JS 的 `Number` 在 2^53 以上会静默丢精度，这是比报错更难排查的问题。',
        '',
        '## 关于分页',
        '列表接口统一返回 `{ items, total, page, pageSize, totalPages }`。',
        '',
        '## 关于权限',
        '角色两级：`admin`（全站）与 `author`（只能操作自己的内容）。',
        '另外账号需要处于 `active` 状态才能执行写操作 —— 注册后是 `pending`，需管理员审核激活。',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: '填入 accessToken（不含 Bearer 前缀）' },
      'bearer',
    )
    .addTag('认证', '注册、登录、令牌刷新、个人资料')
    .addTag('文章 · 前台', '公开的文章浏览、搜索、归档、点赞与阅读量')
    .addTag('文章 · 作者工作台', '作者管理自己的文章')
    .addTag('文章 · 管理员', '管理员的全站文章操作')
    .addTag('评论 · 前台', '文章评论的读取与提交')
    .addTag('评论 · 审核', '评论审核与删除')
    .addTag('分类 · 前台', '公开分类列表')
    .addTag('标签 · 前台', '公开标签列表')
    .addTag('分类 · 管理员', '分类的增删改')
    .addTag('标签 · 管理员', '标签的增删与合并')
    .addTag('作者主页 · 前台', '按用户名查看作者资料与其文章')
    .addTag('用户管理 · 管理员', '账号审核、角色调整、密码重置')
    .addTag('上传', '图片上传')
    .addTag('站点设置 · 前台', '前台读取站点配置')
    .addTag('站点设置 · 管理员', '后台修改站点配置')
    .addTag('统计', '仪表盘与站点概览')
    .addTag('订阅与站点地图', 'RSS 与 sitemap.xml')
    .addTag('系统', '健康检查')
    .build();
}

/** 生成 OpenAPI 文档对象（不启动 HTTP 服务） */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig(), {
    // 让所有可能出现的错误响应结构也进入 components，前端生成的错误处理才有类型
    extraModels: [ErrorResponseDto],
  });

  // 统一给需要鉴权的接口补上 401 响应说明。
  // 手动逐个写 @ApiResponse({status:401}) 太啰嗦且容易漏，这里按「有 security 就算需要鉴权」批量补
  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem ?? {})) {
      const op = operation as Record<string, unknown>;
      if (!op?.security) continue;
      const responses = (op.responses ?? {}) as Record<string, unknown>;
      if (!responses['401']) {
        responses['401'] = {
          description: '未登录或令牌失效',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponseDto' } },
          },
        };
      }
    }
  }

  return document;
}
