import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 响应序列化拦截器。
 *
 * 解决一个 Prisma + BIGINT 的隐性坑：PostgreSQL 的 BIGINT 在 Prisma 里映射为
 * JS `BigInt`，而 `JSON.stringify(BigInt)` 会直接抛
 * `TypeError: Do not know how to serialize a BigInt`。
 * 如果等到上线才发现，表现为「所有列表接口 500」。
 *
 * 处理方式：把 BigInt 统一转成 **字符串**。不转 Number —— id 一旦超过
 * 2^53 就静默丢精度，这是比报错更难查的问题。
 * 日期统一走 ISO 8601 字符串（toJSON 默认行为），前端直接 new Date() 即可。
 */
@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        const cost = Date.now() - startedAt;
        // 只记录耗时较长的请求，避免日志被淹没；调优时把阈值改成 0
        if (cost > 500) {
          this.logger.warn(
            `慢请求 ${request.method} ${request.originalUrl} ${response.statusCode} ${cost}ms`,
          );
        }
        return toJsonSafe(data);
      }),
    );
  }
}

/** 递归转换：BigInt → string；其余保持原样（Date 交给 JSON.stringify） */
function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);

  if (typeof value === 'object') {
    // Buffer / 流这类对象不递归，避免破坏
    if (Buffer.isBuffer(value)) return value;

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      result[key] = toJsonSafe(source[key]);
    }
    return result;
  }

  return value;
}
