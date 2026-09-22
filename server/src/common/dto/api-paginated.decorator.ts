import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * 分页响应的 Swagger 装饰器。
 *
 * 为什么要自己写：NestJS 的 Swagger 无法从 TS 泛型 `PaginatedResponseDto<ArticleDto>`
 * 自动推导出内层模型 —— 泛型在运行时被擦除，装饰器只能拿到 `PaginatedResponseDto` 本身。
 * 结果是 openapi.json 里 `items` 变成裸 `array`，Step 6 用它生成前端时就得不到
 * 字段类型。这里显式拼 schema 解决。
 *
 * 用法：@ApiPaginatedResponse(ArticleListItemDto)
 */
export function ApiPaginatedResponse<TModel extends Type<unknown>>(model: TModel) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description: '分页结果',
      schema: {
        type: 'object',
        required: ['items', 'total', 'page', 'pageSize', 'totalPages'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          total: { type: 'integer', description: '符合条件的总条数', example: 128 },
          page: { type: 'integer', description: '当前页码', example: 1 },
          pageSize: { type: 'integer', description: '每页条数', example: 12 },
          totalPages: { type: 'integer', description: '总页数', example: 11 },
        },
      },
    }),
  );
}
