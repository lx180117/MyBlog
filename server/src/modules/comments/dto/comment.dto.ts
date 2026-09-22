import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateCommentDto {
  @ApiProperty({ description: '评论正文，最多 2000 字', example: '写得很清楚，谢谢分享！' })
  @IsString()
  @IsNotEmpty({ message: '评论内容不能为空' })
  @MaxLength(2000, { message: '评论内容最多 2000 字' })
  content: string;

  @ApiPropertyOptional({
    description: '昵称。**已登录时可省略**（自动取账号昵称）；游客必填',
    example: '路人甲',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ description: '邮箱，仅站内通知使用，不会公开展示', example: 'a@example.com' })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @ApiPropertyOptional({ description: '个人网站', example: 'https://example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({
    description:
      '父评论 ID。填了就是对某条**顶级评论**的回复；回复的回复会被数据库触发器拒绝（两级结构，FR-4.2）',
    example: '5',
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class QueryCommentDto extends PaginationDto {
  @ApiPropertyOptional({
    description: '审核状态筛选；不传返回全部',
    enum: ['pending', 'approved', 'rejected'],
  })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @ApiPropertyOptional({ description: '按文章 ID 筛选', example: '10' })
  @IsOptional()
  @IsString()
  articleId?: string;

  @ApiPropertyOptional({ description: '按文章 slug 筛选', example: 'postgresql-中文全文检索' })
  @IsOptional()
  @IsString()
  articleSlug?: string;

  @ApiPropertyOptional({ description: '按作者用户名筛选（只看某人文章下的评论）', example: 'zhangsan' })
  @IsOptional()
  @IsString()
  authorUsername?: string;

  @ApiPropertyOptional({ description: '关键词，匹配评论正文', example: '广告' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class ModerateCommentDto {
  @ApiProperty({ description: '审核动作', enum: ['approve', 'reject'], example: 'approve' })
  @IsIn(['approve', 'reject'], { message: 'action 只能是 approve 或 reject' })
  action: 'approve' | 'reject';
}

export class BatchModerateDto {
  @ApiProperty({ description: '要处理的评论 ID 列表', example: ['1', '2', '3'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ description: '批量动作', enum: ['approve', 'reject', 'delete'], example: 'approve' })
  @IsIn(['approve', 'reject', 'delete'], { message: 'action 只能是 approve / reject / delete' })
  action: 'approve' | 'reject' | 'delete';
}
