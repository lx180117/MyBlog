import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  CreateTagDto,
  MergeTagsDto,
  TagResponseDto,
  UpdateCategoryDto,
} from './dto/taxonomy.dto';

/**
 * 分类与标签放在同一个模块。
 *
 * 理由：两者的维护规则不同（分类仅管理员可改，标签作者可自由创建），但**查询逻辑
 * 高度重合** —— 都是「列表 + 关联文章数」。拆成两个模块会产生两份几乎一样的
 * count 聚合代码。权限差异由 Controller 上的 @Roles 表达，不靠模块边界。
 */
@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================ 分类
  async findAllCategories(): Promise<CategoryResponseDto[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        // 只统计前台可见的文章（已发布且已到发布时间的才算，草稿不该出现在分类计数里）
        _count: {
          select: { articles: { where: { status: 'published', publishedAt: { lte: new Date() } } } },
        },
      },
    });

    return categories.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      slug: c.slug,
      description: c.description,
      sortOrder: c.sortOrder,
      articleCount: c._count.articles,
    }));
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const slug = dto.slug || slugify(dto.name);
    if (!slug) throw new BadRequestException('无法从名称生成 slug，请手动指定');

    const dup = await this.prisma.category.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
      select: { id: true },
    });
    if (dup) throw new ConflictException('分类名或 slug 已存在');

    const created = await this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return {
      id: created.id.toString(),
      name: created.name,
      slug: created.slug,
      description: created.description,
      sortOrder: created.sortOrder,
      articleCount: 0,
    };
  }

  async updateCategory(id: bigint, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('分类不存在');

    if (dto.name || dto.slug) {
      const dup = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(dto.name ? [{ name: dto.name }] : []),
            ...(dto.slug ? [{ slug: dto.slug }] : []),
          ],
        },
        select: { id: true },
      });
      if (dup) throw new ConflictException('分类名或 slug 已被其他分类使用');
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        slug: dto.slug,
        description: dto.description,
        sortOrder: dto.sortOrder,
      },
    });

    const articleCount = await this.prisma.article.count({
      where: { categoryId: id, status: 'published', publishedAt: { lte: new Date() } },
    });

    return {
      id: updated.id.toString(),
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      sortOrder: updated.sortOrder,
      articleCount,
    };
  }

  /**
   * 删除分类。
   * 外键是 ON DELETE SET NULL，所以文章不会跟着被删，只会变成「未分类」。
   * 这是有意的：删一个分类不该让几十篇文章消失。
   */
  async removeCategory(id: bigint): Promise<{ success: boolean; message: string; affectedArticles: number }> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('分类不存在');

    const affectedArticles = await this.prisma.article.count({ where: { categoryId: id } });

    await this.prisma.$transaction([
      // 先手动把文章的分类置空，再删分类。虽然外键是 SET NULL 会自动处理，
      // 但显式写出来让「到底影响了几篇文章」这件事在事务里是确定的。
      this.prisma.article.updateMany({ where: { categoryId: id }, data: { categoryId: null } }),
      this.prisma.category.delete({ where: { id } }),
    ]);

    return {
      success: true,
      message: `分类已删除，${affectedArticles} 篇文章变为未分类`,
      affectedArticles,
    };
  }

  // ============================================================ 标签
  async findAllTags(): Promise<TagResponseDto[]> {
    const tags = await this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            articleTags: { where: { article: { status: 'published', publishedAt: { lte: new Date() } } } },
          },
        },
      },
    });

    return tags.map((t) => ({
      id: t.id.toString(),
      name: t.name,
      slug: t.slug,
      // 计数为 0 的标签依然返回：管理员需要看到「没人用的标签」才能清理
      articleCount: t._count.articleTags,
    }));
  }

  async createTag(dto: CreateTagDto): Promise<TagResponseDto> {
    const slug = dto.slug || slugify(dto.name) || dto.name.toLowerCase().replace(/\s+/g, '-');

    const dup = await this.prisma.tag.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
      select: { id: true },
    });
    if (dup) throw new ConflictException('标签名或 slug 已存在');

    const created = await this.prisma.tag.create({ data: { name: dto.name.trim(), slug } });
    return { id: created.id.toString(), name: created.name, slug: created.slug, articleCount: 0 };
  }

  async removeTag(id: bigint): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.tag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('标签不存在');

    // article_tags 的外键是 CASCADE，关联记录会一并清理
    await this.prisma.tag.delete({ where: { id } });
    return { success: true, message: `标签「${existing.name}」已删除` };
  }

  /**
   * 合并标签（FR-3.2 后台标签合并）。
   * 典型场景：「JS」「javascript」「Javascript」三个标签其实是同一个东西。
   *
   * 注意冲突：某篇文章可能同时挂了源标签和目标标签，直接 updateMany 会撞
   * article_tags 的联合主键。所以先删掉「已经同时存在」的重复关联，再改写剩下的。
   */
  async mergeTags(dto: MergeTagsDto): Promise<{ success: boolean; message: string; movedArticles: number }> {
    const targetId = BigInt(dto.targetTagId);
    const sourceIds = dto.sourceTagIds.map((s) => BigInt(s)).filter((id) => id !== targetId);

    if (sourceIds.length === 0) {
      throw new BadRequestException('请至少指定一个与目标不同的源标签');
    }

    const [target, sources] = await Promise.all([
      this.prisma.tag.findUnique({ where: { id: targetId } }),
      this.prisma.tag.findMany({ where: { id: { in: sourceIds } } }),
    ]);

    if (!target) throw new NotFoundException('目标标签不存在');
    if (sources.length !== sourceIds.length) throw new NotFoundException('部分源标签不存在');

    const movedArticles = await this.prisma.articleTag.count({
      where: { tagId: { in: sourceIds } },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1. 找出「目标标签已经存在」的文章，这些文章的源标签关联直接删掉即可
      const alreadyLinked = await tx.articleTag.findMany({
        where: { tagId: targetId, article: { tags: { some: { tagId: { in: sourceIds } } } } },
        select: { articleId: true },
      });
      if (alreadyLinked.length > 0) {
        await tx.articleTag.deleteMany({
          where: { tagId: { in: sourceIds }, articleId: { in: alreadyLinked.map((r) => r.articleId) } },
        });
      }

      // 2. 其余关联改挂到目标标签
      await tx.articleTag.updateMany({
        where: { tagId: { in: sourceIds } },
        data: { tagId: targetId },
      });

      // 3. 删掉已经没有关联的源标签
      await tx.tag.deleteMany({ where: { id: { in: sourceIds } } });
    });

    return {
      success: true,
      message: `已将 ${sources.length} 个标签合并到「${target.name}」`,
      movedArticles,
    };
  }
}
