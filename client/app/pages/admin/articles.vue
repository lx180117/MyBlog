<script setup lang="ts">
/**
 * 全站文章管理。
 * 表格复用 ConsoleArticleTable —— 管理端多两样东西：作者列、彻底删除。
 */
definePageMeta({ layout: 'console', middleware: ['admin'] });
</script>

<template>
  <div>
    <ConsolePageHeader
      title="全部文章"
      description="所有作者的草稿、已发布与回收站文章。彻底删除会连同评论、点赞、阅读记录一起清除，不可恢复。"
    >
      <template #actions>
        <NuxtLink to="/dashboard/articles/new" class="btn-primary btn-sm">写新文章</NuxtLink>
      </template>
    </ConsolePageHeader>

    <div class="card p-4">
      <ConsoleArticleTable endpoint="/admin/articles" show-author purgeable />
    </div>
  </div>
</template>
