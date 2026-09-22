import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import type { UploadedImageDto } from './dto/upload.dto';

/**
 * 文件上传。
 *
 * 存储策略：**本地目录 + 存储接口抽象**（Q8 的默认值）。
 * 之所以不直接写死「本地路径」，是因为将来换成对象存储（OSS/S3）时只需要
 * 换掉这个 service 的实现，Controller 与业务代码不用动。
 *
 * 安全上有三道校验，缺一不可：
 *   1. 扩展名白名单
 *   2. MIME 类型白名单
 *   3. **文件头魔数校验** —— 前两条都能被伪造（改个扩展名、改个 Content-Type
 *      就行），只有真实字节不会骗人。攻击者上传一个改了扩展名的 PHP/HTML 文件
 *      到 Web 目录，如果再配合一个错误的 Nginx 配置，就是一个存储型 XSS 甚至 RCE。
 */

/**
 * 返回体类型。用 dto 里的 class 而不是就地定义 interface ——
 * 接口不会进入 OpenAPI 文档，前端就拿不到字段（见 dto/upload.dto.ts 的说明）。
 */
export type UploadedImageInfo = UploadedImageDto;

/** 传入的 multer 文件对象（不依赖 @types/multer，避免多装一个类型包） */
export interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_MIME: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

/** 各图片格式的文件头魔数 */
const MAGIC_NUMBERS: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // WebP 的容器是 RIFF....WEBP，需要同时校验两段
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  private get uploadDir(): string {
    return resolve(process.env.UPLOAD_DIR || './uploads');
  }

  private get baseUrl(): string {
    return (process.env.UPLOAD_BASE_URL || '').replace(/\/$/, '');
  }

  private get maxSize(): number {
    return Number(process.env.UPLOAD_MAX_SIZE) || 5 * 1024 * 1024;
  }

  async saveImage(file: IncomingFile): Promise<UploadedImageInfo> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('没有收到文件内容');
    }

    if (file.size > this.maxSize) {
      throw new BadRequestException(
        `文件过大，最大允许 ${(this.maxSize / 1024 / 1024).toFixed(1)} MB`,
      );
    }

    const ext = extname(file.originalname || '').toLowerCase();
    const allowedExts = ALLOWED_MIME[file.mimetype];
    if (!allowedExts) {
      throw new BadRequestException(
        `不支持的类型 ${file.mimetype}，仅允许 jpg / png / gif / webp`,
      );
    }
    if (ext && !allowedExts.includes(ext)) {
      throw new BadRequestException('文件扩展名与内容类型不匹配');
    }

    const detected = detectImageMime(file.buffer);
    if (!detected) {
      throw new BadRequestException('文件内容不是有效的图片，或格式不受支持');
    }
    if (detected !== file.mimetype) {
      // 这是最关键的一道：Content-Type 说是 png，字节头却是别的 —— 直接拒绝并记日志
      this.logger.warn(
        `上传内容与声明类型不符：声明 ${file.mimetype}，实际 ${detected}，文件名 ${file.originalname}`,
      );
      throw new BadRequestException('文件内容与声明的类型不一致，已拒绝');
    }

    // 按年月分目录：单目录文件数过多时（几万个）ls 与备份都会变慢
    const now = new Date();
    const subDir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const targetDir = join(this.uploadDir, subDir);

    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }

    // 文件名用「时间戳 + 内容哈希前 8 位 + 随机段」：
    //  - 不用原始文件名：中文/特殊字符在 URL 里要转义，且容易撞名
    //  - 带上内容哈希：同一张图重复上传时肉眼可辨（虽然默认不自动去重）
    const hash = createHash('sha256').update(file.buffer).digest('hex').slice(0, 8);
    const filename = `${Date.now()}-${hash}-${randomUUID().slice(0, 8)}${ext || '.jpg'}`;
    const absolutePath = join(targetDir, filename);

    await writeFile(absolutePath, file.buffer);

    const relativePath = `${subDir}/${filename}`;
    const dimensions = readImageSize(file.buffer);

    return {
      url: this.baseUrl ? `${this.baseUrl}/${relativePath}` : `/uploads/${relativePath}`,
      path: absolutePath,
      filename,
      size: file.size,
      mimeType: detected,
      ...dimensions,
    };
  }
}

/**
 * 通过文件头判断真实图片类型。
 * 只读前 16 字节，不解析整个文件 —— 这里的目的不是识别图片内容，
 * 而是确认「它确实是一张图片」，所以够用且便宜。
 */
function detectImageMime(buffer: Buffer): string | null {
  for (const rule of MAGIC_NUMBERS) {
    const offset = rule.offset ?? 0;
    if (buffer.length < offset + rule.bytes.length) continue;
    const matched = rule.bytes.every((b, i) => buffer[offset + i] === b);
    if (!matched) continue;

    if (rule.mime === 'image/webp') {
      // RIFF 只是容器标识，必须再看第 8–11 字节是否为 WEBP，否则可能是 wav/avi
      const isWebp = buffer.slice(8, 12).toString('ascii') === 'WEBP';
      if (!isWebp) continue;
    }
    return rule.mime;
  }
  return null;
}

/**
 * 从字节流里读图片宽高。
 * 故意不引入 `sharp` / `image-size` 这类依赖：它们要么是原生模块（编译风险），
 * 要么为了支持几十种格式而带来不必要的体积。这里只处理四种白名单格式，手写解析足够，
 * 拿到宽高是为了让前端能预留占位空间、避免图片加载时的布局抖动（CLS）。
 */
function readImageSize(buffer: Buffer): { width?: number; height?: number } {
  try {
    // PNG：IHDR 固定在第 16 字节起
    if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }

    // GIF：第 6 字节起是小端的两组 16 位
    if (buffer.slice(0, 4).toString('ascii') === 'GIF8') {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }

    // JPEG：遍历段，找到 SOF0–SOF3 / SOF5–SOF7 标记
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7);
        const segmentLength = buffer.readUInt16BE(offset + 2);

        if (isSof) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + segmentLength;
      }
    }

    // WebP（VP8X 扩展格式）
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
      const format = buffer.slice(12, 16).toString('ascii');
      if (format === 'VP8X') {
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { width, height };
      }
    }
  } catch {
    // 尺寸解析失败不影响上传本身，静默忽略
  }
  return {};
}
