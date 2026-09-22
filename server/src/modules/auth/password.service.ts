import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, ScryptOptions, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

/**
 * promisify 只能捕捉到 scrypt 的第一个重载（三参数版本），
 * 而我们要传 maxmem 选项，所以显式声明成四参数签名。
 * 这是 Node 类型定义的限制，不是用法问题。
 */
type ScryptFn = (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const scrypt = promisify(scryptCallback) as unknown as ScryptFn;

/**
 * 密码哈希服务。
 *
 * ⚠️ 与需求文档（FR-1.7 写的是 argon2）的一处偏离，这里说明理由：
 *
 *   `argon2` 这个 npm 包是**原生模块**，安装时要跑 node-gyp 或下载预编译二进制。
 *   在 Windows / 无构建工具链 / 内网无外网的生产机上，这一步经常直接失败或
 *   装出一个与目标 Node 版本 ABI 不匹配的包。而密码哈希是登录链路的第一环，
 *   它跑不起来整个系统就登不进去 —— 这个风险不值得为一个算法名去赌。
 *
 *   这里改用 **Node 内置 crypto.scrypt**：OWASP 推荐的密码存储算法之一，
 *   零依赖、零编译、无 bcrypt 的 72 字节截断问题，且 scrypt 本身就是
 *   memory-hard 设计（对 GPU 爆破的抵抗力和 argon2id 属同一量级）。
 *
 *   参数取 OWASP 建议值：N=2^15(32768)、r=8、p=1，约 32MB 内存。
 *
 * 存储格式：`scrypt$N$r$p$<saltBase64>$<hashBase64>`
 * 前缀法让**算法可升级**：日后若换回 argon2id，只需在 verify 里按前缀分派，
 * 老用户下次登录时按新算法重新哈希即可，无需强制所有人改密码。
 */
@Injectable()
export class PasswordService {
  private readonly N = 32768; // CPU/内存开销因子，必须是 2 的幂
  private readonly r = 8; // 块大小
  private readonly p = 1; // 并行度
  private readonly keyLength = 64;
  private readonly saltLength = 16;

  async hash(plain: string): Promise<string> {
    const salt = randomBytes(this.saltLength);
    const derived = (await scrypt(plain, salt, this.keyLength, {
      N: this.N,
      r: this.r,
      p: this.p,
      // scrypt 的默认 maxmem 不足以支撑 N=32768（需 ~128*N*r = 32MB），必须显式放宽
      maxmem: 128 * this.N * this.r * 2,
    })) as Buffer;

    return [
      'scrypt',
      this.N,
      this.r,
      this.p,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    if (!stored?.startsWith('scrypt$')) {
      // 未知格式（例如手工写进库的 argon2 哈希）：一律判定失败，
      // 绝不做「格式不对就放行」这种兜底 —— 那是安全漏洞
      return false;
    }

    const [, nStr, rStr, pStr, saltB64, hashB64] = stored.split('$');
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);

    if (!N || !r || !p || !saltB64 || !hashB64) return false;

    const expected = Buffer.from(hashB64, 'base64');
    const derived = (await scrypt(plain, Buffer.from(saltB64, 'base64'), expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    })) as Buffer;

    // 定长比较，防时序侧信道
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }

  /**
   * 密码强度校验（FR-1.1：≥8 位且同时含字母与数字）。
   * 放在 service 而非 DTO 里，是因为「重置密码」「修改密码」也要复用同一套规则。
   */
  validateStrength(plain: string): string | null {
    if (!plain || plain.length < 8) return '密码长度不能少于 8 位';
    if (plain.length > 64) return '密码长度不能超过 64 位';
    if (!/[a-zA-Z]/.test(plain)) return '密码必须包含至少一个字母';
    if (!/\d/.test(plain)) return '密码必须包含至少一个数字';
    return null;
  }
}
