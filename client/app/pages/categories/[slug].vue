<script setup lang="ts">
/**
 * 分类页（FR-3.4）。
 *
 * 分类名从 useTaxonomy 的缓存里查（页头/侧栏已经拉过一次），
 * 查不到时直接 404 —— 与其渲染一个「未知分类」的空页，
 * 不如给一个明确的 404，对用户和爬虫都更清楚。
 *
 * `definePageMeta({ key })` 是必须的：从 /categories/a 点到 /categories/b
 * 属于同一条路由记录，Vue Router 会复用组件、**不重新执行 setup**，
 * 于是 useAsyncData 的缓存键和这里的 404 判断都不会重算，页面就卡在旧数据上。
 * 用 fullPath 做 key 强制重挂载，这类「参数变了但页面没变」的 bug 一次性消掉。
 */
definePageMeta({ key: (route) => route.fullPath });

const route = useRoute();
const { categories, loadTaxonomy } = useTaxonomy();
const { load: loadSettings } = useSettings();

const slug = computed(() => String(route.params.slug));

await Promise.all([loadTaxonomy(), loadSettings()]);

const category = computed(() => categories.value.find((c) => c.slug === slug.value) ?? null);

if (!category.value) {
  throw createError({ statusCode: 404, message: '这个分类不存在' });
}

useSeoMeta({
  title: () => `${category.value?.name ?? '分类'} · 分类`,
  description: () =>
    category.value?.description ||
    `「${category.value?.name ?? ''}」分类下的全部文章，共 ${category.value?.articleCount ?? 0} 篇。`,
});
</script>

<template>
  <div class="container-page py-10">
    <nav class="mb-6 flex items-center gap-1.5 text-xs text-slate-400" aria-label="面包屑">
      <NuxtLink to="/" class="transition hover:text-slate-600 dark:hover:text-slate-300">首页</NuxtLink>
      <span>/</span>
      <span class="text-slate-500 dark:text-slate-400">分类</span>
    </nav>

    <header class="mb-8">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        {{ category?.name }}
      </h1>
      <p
        v-if="category?.description"
        class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400"
      >
        {{ category.description }}
      </p>
    </header>

    <ArticleFeed
      :filters="{ categorySlug: slug }"
      :empty-title="`「${category?.name}」下还没有文章`"
      empty-description="换个分类看看，或者回到首页。"
      show-sort
    >
      <template #empty>
        <NuxtLink to="/" class="btn-ghost btn-sm">回到首页</NuxtLink>
      </template>
    </ArticleFeed>
  </div>
</template>
