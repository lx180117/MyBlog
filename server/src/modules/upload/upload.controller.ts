import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UploadService, IncomingFile } from './upload.service';
import { UploadedImageDto } from './dto/upload.dto';
import { RequireActive, Roles } from '../../common/decorators';
import { ErrorResponseDto } from '../../common/dto/common-response.dto';

@ApiTags('上传')
@ApiBearerAuth()
@Controller('me/upload')
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('image')
  @RequireActive()
  @Roles('author', 'admin')
  @UseInterceptors(
    // 用内存存储而不是 diskStorage：先收进内存做文件头校验，确认是真图片再落盘。
    // 如果直接落盘，磁盘上就会短暂存在未经校验的文件
    FileInterceptor('file', {
      limits: { fileSize: Number(process.env.UPLOAD_MAX_SIZE) || 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '图片文件',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'jpg / png / gif / webp，默认上限 5MB' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: '上传图片',
    description: [
      '用于文章封面与正文配图。**三道校验**：扩展名白名单、MIME 白名单、文件头魔数比对。',
      '第三道是关键 —— 前两道都能被伪造（改扩展名、改 Content-Type 即可），只有真实字节不会骗人。',
      '',
      '文件按 `年/月` 分目录存放，文件名使用「时间戳 + 内容哈希 + 随机段」，不保留原始文件名。',
      '响应里会带上图片宽高，前端可用它预留占位、避免图片加载时的布局抖动。',
    ].join('\n'),
  })
  @ApiResponse({ status: 201, description: '上传成功，返回可访问的 URL', type: UploadedImageDto })
  @ApiResponse({ status: 400, description: '类型不支持、内容与声明不符或超出大小限制', type: ErrorResponseDto })
  async uploadImage(@UploadedFile() file: IncomingFile): Promise<UploadedImageDto> {
    if (!file) throw new BadRequestException('请选择要上传的文件（字段名 file）');
    return this.upload.saveImage(file);
  }
}
