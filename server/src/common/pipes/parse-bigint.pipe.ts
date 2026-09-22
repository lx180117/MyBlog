import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * 把路径参数转成 bigint。
 *
 * 为什么需要这个管道：控制器里直接写 `BigInt(id)`，请求 `/articles/abc/like`
 * 会抛 `SyntaxError: Cannot convert abc to a BigInt`。它不是 HttpException，
 * 全局异常过滤器只能按「未捕获异常」处理，于是**一个明显的客户端错误返回了 500**，
 * 同时往日志里灌一整段错误堆栈 —— 可以被人拿来刷日志。
 *
 * 由管道统一转换后，非法 ID 稳定返回 400，并把原始值回显给调用方便于排查。
 *
 * 只接受纯数字：这里的 ID 全部来自 BIGINT GENERATED ALWAYS AS IDENTITY，
 * 一定是非负整数，负数与小数都视为非法输入。
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new BadRequestException(`无效的 ID：${value}`);
    }
    return BigInt(value);
  }
}
