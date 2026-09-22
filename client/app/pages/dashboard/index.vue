<script setup lang="ts">
import type { ArticleStatsDto } from '~/types/api';

definePageMeta({ layout: 'console', middleware: ['auth'] });

const api = useApi();
const stats = ref<ArticleStatsDto | null>(null);

/**
 * 统计单独拉一次，列表由 ConsoleArticleTable 自己管。
 * 两者刻意不合并成一个请求：统计是「抬头信息」，列表是主体，
 * 列表翻页/筛选时不需要重新算统计。
 */
async function loadStats() {
  try {
    stats.value = await api.get<ArticleStatsDto>('/me/articles/stats');
  } catch {
    // 统计拿不到不该挡住列表 —— 列表才是这页的主体，让数字保持占位符即可
  }
}

onMounted(loadStats);
</script>

<template>
  <div>
    <ConsolePageHeader
      title="我的文章"
      description="草稿、已发布、回收站都在这里。点标题进编辑器；回收站里的文章可以恢复。"
    >
      <template #actions>
        <NuxtLink to="/dashboard/articles/new" class="btn-primary btn-sm">写新文章</NuxtLink>
      </template>
    </ConsolePageHeader>

    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <ConsoleStatTile label="全部" :value="stats ? stats.total : '—'" />
      <ConsoleStatTile label="已发布" :value="stats ? stats.published : '—'" tone="success" />
      <ConsoleStatTile label="草稿" :value="stats ? stats.draft : '—'" tone="info" />
      <ConsoleStatTile
        label="定时发布"
        :value="stats ? stats.scheduled : '—'"
        tone="warning"
        hint="到点自动上线"
      />
      <ConsoleStatTile label="回收站" :value="stats ? stats.deleted : '—'" tone="danger" />
    </div>

    <div class="card p-4">
      <ConsoleArticleTable endpoint="/me/articles" @changed="loadStats" />
    </div>
  </div>
</template>
