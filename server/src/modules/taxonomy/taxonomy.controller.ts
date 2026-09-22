import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TaxonomyService } from './taxonomy.service';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  CreateTagDto,
  MergeTagsDto,
  TagResponseDto,
  UpdateCategoryDto,
} from './dto/taxonomy.dto';
import { Public, Roles } from '../../common/decorators';
import { ErrorResponseDto, OperationResultDto } from '../../common/dto/common-response.dto';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@ApiTags('分类 · 前台')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '分类列表（公开）',
    description: '按 `sortOrder` 升序返回，`articleCount` 只统计前台可见的文章（已发布且已到发布时间）。',
  })
  @ApiResponse({ status: 200, description: '分类列表', type: [CategoryResponseDto] })
  findAll() {
    return this.taxonomy.findAllCategories();
  }
}

@ApiTags('标签 · 前台')
@Controller('tags')
export class TagsController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '标签列表（公开）', description: '按名称升序。包含 `articleCount=0` 的标签。' })
  @ApiResponse({ status: 200, description: '标签列表', type: [TagResponseDto] })
  findAll() {
    return this.taxonomy.findAllTags();
  }
}

@ApiTags('分类 · 管理员')
@ApiBearerAuth()
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: '新建分类', description: '仅管理员。作者只能在前台选用分类，不能创建（FR-3.1）。' })
  @ApiResponse({ status: 201, description: '创建成功', type: CategoryResponseDto })
  @ApiResponse({ status: 409, description: '分类名或 slug 已存在', type: ErrorResponseDto })
  create(@Body() dto: CreateCategoryDto) {
    return this.taxonomy.createCategory(dto);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: '修改分类' })
  @ApiParam({ name: 'id', example: '1' })
  @ApiResponse({ status: 200, description: '更新成功', type: CategoryResponseDto })
  update(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: UpdateCategoryDto) {
    return this.taxonomy.updateCategory(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({
    summary: '删除分类',
    description:
      '外键为 `ON DELETE SET NULL`：**分类下的文章不会被删除**，只会变为「未分类」。响应里会告知受影响的文章数。',
  })
  @ApiResponse({ status: 200, description: '删除成功并返回受影响文章数' })
  remove(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.taxonomy.removeCategory(id);
  }
}

@ApiTags('标签 · 管理员')
@ApiBearerAuth()
@Controller('admin/tags')
export class AdminTagsController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: '新建标签', description: '作者在发文时也能自动创建标签，此接口供后台手工补建。' })
  @ApiResponse({ status: 201, description: '创建成功', type: TagResponseDto })
  create(@Body() dto: CreateTagDto) {
    return this.taxonomy.createTag(dto);
  }

  @Post('merge')
  @Roles('admin')
  @ApiOperation({
    summary: '合并标签',
    description:
      '把多个标签合并为一个，典型场景是清理「JS / javascript / Javascript」这类同义标签。合并后源标签被删除，其文章改挂到目标标签。',
  })
  @ApiResponse({ status: 200, description: '合并结果' })
  @ApiResponse({ status: 400, description: '源标签与目标标签相同或为空', type: ErrorResponseDto })
  merge(@Body() dto: MergeTagsDto) {
    return this.taxonomy.mergeTags(dto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: '删除标签', description: '关联的 `article_tags` 记录由外键级联清理，文章本身不受影响。' })
  @ApiResponse({ status: 200, description: '删除成功', type: OperationResultDto })
  remove(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.taxonomy.removeTag(id);
  }
}
