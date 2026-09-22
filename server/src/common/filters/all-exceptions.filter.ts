import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * 全局异常过滤器：把各类异常压成统一的错误结构，避免把内部细节泄露给前端。
 *
 * 三类特殊处理（都是实际会踩到的）：
 * 1. Prisma P2002 唯一约束冲突 → 400 + 友好提示，而不是 500。注册时用户名重复
 *    走的就是这条；如果不映射，前端只能看到「服务器错误」。
 * 2. Prisma P2025 记录不存在 → 404，而不是 500。
 * 3. 数据库触发器 RAISE EXCEPTION（如「只支持两级评论」）→ 400，把原文透出，
 *    因为那是我们自己写的业务文案。
 * 4. 其它未知异常 → 500，日志记完整堆栈，响应只给一句通用提示。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = '服务器内部错误，请稍后重试';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? exception.message;
        error = (obj.error as string) ?? exception.name;
      }
      if (error === 'Internal Server Error') error = exception.name.replace('Exception', '');
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, error, message } = mapPrismaError(exception));
    } else if (isTriggerError(exception)) {
      // 数据库触发器主动 RAISE EXCEPTION，属于业务校验，不该算 500
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = extractDbMessage(exception);
    } else {
      const err = exception as Error;
      this.logger.error(
        `未捕获异常 ${request.method} ${request.originalUrl}: ${err?.message}`,
        err?.stack,
      );
    }

    if (status >= 500) {
      this.logger.error(`${status} ${request.method} ${request.originalUrl}`, JSON.stringify(message));
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
  status: number;
  error: string;
  message: string;
} {
  switch (e.code) {
    case 'P2002': {
      // e.meta.target 在 PostgreSQL 下是索引名或列名数组，直接透出对用户不够友好
      const target = String((e.meta?.target as unknown as string) ?? '');
      if (target.includes('username')) {
        return { status: 409, error: 'Conflict', message: '该用户名已被占用' };
      }
      if (target.includes('email')) {
        return { status: 409, error: 'Conflict', message: '该邮箱已被注册' };
      }
      if (target.includes('slug')) {
        return { status: 409, error: 'Conflict', message: '该 URL 标识已被占用，请换一个' };
      }
      return { status: 409, error: 'Conflict', message: '数据已存在，违反唯一约束' };
    }
    case 'P2025':
      return { status: 404, error: 'Not Found', message: '记录不存在或已被删除' };
    case 'P2003':
      return { status: 400, error: 'Bad Request', message: '关联的数据不存在，请检查后重试' };
    case 'P2000':
      return { status: 400, error: 'Bad Request', message: '输入内容长度超出限制' };
    default:
      return { status: 500, error: 'Internal Server Error', message: '数据库操作失败' };
  }
}

/** PostgreSQL 的 RAISE EXCEPTION 会带上 SQLSTATE，Prisma 包成 PrismaClientUnknownRequestError */
function isTriggerError(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /^P0001|raise_exception|只支持两级评论|父评论不存在/.test(msg);
}

function extractDbMessage(e: unknown): string {
  const raw = (e as Error)?.message ?? '';
  // Prisma 把 PG 错误包装成多行文本，异常文案排在最后一行
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || '数据校验未通过';
}
