<script setup lang="ts">
/** 标签页。结构与分类页一致，差别只有数据来源和标题。 */
definePageMeta({ key: (route) => route.fullPath });

const route = useRoute();
const { tags, loadTaxonomy } = useTaxonomy();
const { load: loadSettings } = useSettings();

const slug = computed(() => String(route.params.slug));

await Promise.all([loadTaxonomy(), loadSettings()]);

const tag = computed(() => tags.value.find((t) => t.slug === slug.value) ?? null);

if (!tag.value) {
  throw createError({ statusCode: 404, message: '这个标签不存在' });
}

useSeoMeta({
  title: () => `标签：${tag.value?.name ?? ''}`,
  description: () => `带有「${tag.value?.name ?? ''}」标签的全部文章，共 ${tag.value?.articleCount ?? 0} 篇。`,
});
</script>

<template>
  <div class="container-page py-10">
    <nav class="mb-6 flex items-center gap-1.5 text-xs text-slate-400" aria-label="面包屑">
      <NuxtLink to="/" class="transition hover:text-slate-600 dark:hover:text-slate-300">首页</NuxtLink>
      <span>/</span>
      <span class="text-slate-500 dark:text-slate-400">标签</span>
    </nav>

    <header class="mb-8">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        <span class="text-slate-400 dark:text-slate-600">#</span>{{ tag?.name }}
      </h1>
    </header>

    <ArticleFeed
      :filters="{ tagSlug: slug }"
      :empty-title="`还没有文章用「${tag?.name}」标签`"
      empty-description="这个标签刚被创建，等等看。"
      show-sort
    >
      <template #empty>
        <NuxtLink to="/" class="btn-ghost btn-sm">回到首页</NuxtLink>
      </template>
    </ArticleFeed>
  </div>
</template>
