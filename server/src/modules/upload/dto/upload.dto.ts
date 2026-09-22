import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 上传成功后的返回体。
 *
 * 为什么要单独定义成 class 而不是留一个 TS interface：
 * `@nestjs/swagger` 只认反射元数据 + 装饰器，对纯 TS 接口一无所知 ——
 * 用 interface 做返回类型，产出的 OpenAPI 里就只有一个空的 `type: object`，
 * 前端生成出来的类型是 `Record<string, unknown>`，等于白费。
 * 这个类的存在就是为了让契约带上字段。
 */
export class UploadedImageDto {
  @ApiProperty({
    description: '可公开访问的图片地址，直接用于 Markdown 图片语法或封面字段',
    example: 'http://localhost:3000/uploads/2026/09/1726xxxxxxxx-a1b2c3d4.webp',
  })
  url: string;

  @ApiProperty({ description: '服务器上的绝对路径，用于排查与备份脚本' })
  path: string;

  @ApiProperty({ description: '生成的文件名（时间戳 + 内容哈希 + 随机段，不保留原始名）', example: '1726xxxxxxxx-a1b2c3d4.webp' })
  filename: string;

  @ApiProperty({ description: '文件字节数', example: 128456 })
  size: number;

  @ApiProperty({ description: '经文件头校验后的真实 MIME 类型', example: 'image/webp' })
  mimeType: string;

  @ApiPropertyOptional({ description: '图片宽度（px）。可用于预留占位、避免加载时布局抖动', example: 1280 })
  width?: number;

  @ApiPropertyOptional({ description: '图片高度（px）', example: 720 })
  height?: number;
}
