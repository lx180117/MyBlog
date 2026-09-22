import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

class SocialLinkDto {
  @ApiProperty({ description: '展示名', example: 'GitHub' })
  name: string;

  @ApiProperty({ description: '链接', example: 'https://github.com/zhangsan' })
  url: string;

  @ApiPropertyOptional({ description: '图标标识', example: 'github' })
  icon?: string;
}

/** 前台可读的站点配置（不包含敏感词等管理项） */
export class PublicSiteSettingsDto {
  @ApiProperty({ description: '站点名称', example: '我的博客' })
  siteName: string;

  @ApiProperty({ description: '站点副标题 / SEO description' })
  siteDescription: string;

  @ApiPropertyOptional({ description: 'Logo 地址', type: String, nullable: true })
  siteLogo?: string | null;

  @ApiPropertyOptional({ description: 'favicon 地址', type: String, nullable: true })
  siteFavicon?: string | null;

  @ApiPropertyOptional({ description: 'ICP 备案号；为空则前台不展示', type: String, nullable: true })
  icpNumber?: string | null;

  @ApiProperty({ description: '前台列表每页条数', example: 12 })
  perPage: number;

  @ApiProperty({ description: '是否开放自助注册', example: true })
  registerEnabled: boolean;

  @ApiProperty({ description: '注册后是否需要管理员审核', example: true })
  registerNeedApprove: boolean;

  @ApiProperty({ description: '评论功能是否开启', example: true })
  commentEnabled: boolean;

  @ApiProperty({ description: '新评论是否需要审核', example: true })
  commentNeedApprove: boolean;

  @ApiProperty({ description: '是否允许未登录访客评论', example: true })
  commentAllowGuest: boolean;

  @ApiProperty({ description: '社交链接', type: [SocialLinkDto] })
  socialLinks: SocialLinkDto[];
}

export class SiteSettingsValuesDto {
  @ApiProperty({ description: '配置键值对', example: { site_name: '我的博客', per_page: '12' } })
  values: Record<string, string>;

  @ApiProperty({ description: '配置项说明，键与 values 对应' })
  descriptions: Record<string, string>;
}

export class UpdateSettingsDto {
  @ApiProperty({
    description:
      '要更新的配置键值对。只接受白名单内的键（站点信息、每页条数、注册与评论开关、敏感词、社交链接），其余会被忽略',
    example: { site_name: '我的博客', comment_need_approve: 'false' },
  })
  @IsObject()
  values: Record<string, string | number | boolean>;
}

export class UpdateSettingsResultDto {
  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiProperty({ description: '结果说明' })
  message: string;

  @ApiProperty({ description: '实际被更新的配置键', type: [String] })
  updated: string[];
}

export class SensitiveWordsDto {
  @ApiProperty({ description: '敏感词列表', type: [String], example: ['广告', '加微信'] })
  words: string[];

  @ApiPropertyOptional({ description: '要替换的键（固定为 sensitive_words）' })
  @IsOptional()
  settingKey?: string;
}
