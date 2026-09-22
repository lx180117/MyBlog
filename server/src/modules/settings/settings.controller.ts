import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  PublicSiteSettingsDto,
  SiteSettingsValuesDto,
  UpdateSettingsDto,
  UpdateSettingsResultDto,
} from './dto/settings.dto';
import { Public, Roles } from '../../common/decorators';

@ApiTags('站点设置 · 前台')
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '前台站点配置（公开）',
    description:
      '前端启动时调用一次，拿到站点名、每页条数、评论开关、是否开放注册等。**不返回敏感词等管理项。** 服务端有 30 秒进程内缓存。',
  })
  @ApiResponse({ status: 200, description: '站点公开配置', type: PublicSiteSettingsDto })
  getPublic() {
    return this.settings.getPublicSettings();
  }
}

@ApiTags('站点设置 · 管理员')
@ApiBearerAuth()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: '读取全部配置（含说明）', description: '后台设置页初始化用。' })
  @ApiResponse({ status: 200, description: '完整配置', type: SiteSettingsValuesDto })
  getAll() {
    return this.settings.getAdminSettings();
  }

  @Patch()
  @Roles('admin')
  @ApiOperation({
    summary: '批量更新配置',
    description:
      '只接受白名单内的键，其余键静默忽略（不是报错，方便前端整表单提交）。更新后缓存立即失效。',
  })
  @ApiResponse({ status: 200, description: '更新结果', type: UpdateSettingsResultDto })
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  @Get('sensitive-words')
  @Roles('admin')
  @ApiOperation({
    summary: '读取敏感词列表',
    description: '从 `site_settings.sensitive_words` 解析（支持逗号、中文逗号、换行分隔）。',
  })
  @ApiResponse({ status: 200, description: '敏感词数组', type: [String] })
  async getSensitiveWords(): Promise<string[]> {
    return this.settings.getSensitiveWords();
  }
}
