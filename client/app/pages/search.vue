<script setup lang="ts">
/**
 * 搜索页（FR-5）。
 *
 * 这一页同时承担「通用筛选结果页」的角色：年 / 月 / 分类 / 标签 / 作者
 * 这些筛选条件都能通过 URL 传进来（归档页的「查看全部」就指到这里）。
 * 好处是后端只有一个 /articles 列表接口，前端也只有一个结果页要维护。
 *
 * 搜索词走 URL 而不是组件状态，理由同分页：结果可分享、可收录（虽然下面
 * 对带关键词的结果页做了 noindex）、刷新不丢。
 *
 * noindex 的取舍：自建站的搜索结果是站内内容的重排，收录它会产生大量
 * 近似重复页面，稀释真实文章页的权重。保留 URL 可访问（用户要分享），
 * 但不让爬虫索引。
 */
const route = useRoute();
const router = useRouter();
const { load: loadSettings } = useSettings();
const { categories, tags, loadTaxonomy } = useTaxonomy();

await Promise.all([loadSettings(), loadTaxonomy()]);

const keyword = ref(String(route.query.q ?? ''));

// 从别处跳进来或前进后退时同步输入框
watch(
  () => route.query.q,
  (v) => {
    keyword.value = String(v ?? '');
  },
);

/**
 * 透传给后端的筛选条件。
 * 只挑白名单里的键 —— 直接把 route.query 全量透传会把 page/sort 之类
 * 也塞进列表查询，甚至把任意参数转发给后端。
 */
const FILTER_KEYS = ['year', 'month', 'categorySlug', 'tagSlug', 'authorUsername'] as const;

const filters = computed(() => {
  const out: Record<string, string | number | undefined> = {};
  const q = keyword.value.trim();
  if (q) out.keyword = q;
  for (const key of FILTER_KEYS) {
    const v = route.query[key];
    if (v !== undefined && v !== '') out[key] = String(v);
  }
  return out;
});

/** 当前生效的筛选条件，渲染成可单独移除的标签 */
const activeFilters = computed(() => {
  const out: { key: string; label: string; value: string }[] = [];
  const y = route.query.year;
  const m = route.query.month;
  if (y) out.push({ key: 'year', label: '时间', value: `${y} 年${m ? ` ${m} 月` : ''}` });

  const cs = route.query.categorySlug;
  if (cs) {
    const c = categories.value.find((x) => x.slug === cs);
    out.push({ key: 'categorySlug', label: '分类', value: c?.name ?? String(cs) });
  }

  const ts = route.query.tagSlug;
  if (ts) {
    const t = tags.value.find((x) => x.slug === ts);
    out.push({ key: 'tagSlug', label: '标签', value: t?.name ?? String(ts) });
  }

  const au = route.query.authorUsername;
  if (au) out.push({ key: 'authorUsername', label: '作者', value: String(au) });

  return out;
});

function submit() {
  const query: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const v = route.query[key];
    if (v !== undefined && v !== '') query[key] = String(v);
  }
  const q = keyword.value.trim();
  if (q) query.q = q;
  // 换关键词回到第一页
  router.push({ path: '/search', query });
}

function removeFilter(key: string) {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(route.query)) {
    if (k === key || (key === 'year' && k === 'month')) continue;
    if (v !== undefined && v !== '') query[k] = String(v);
  }
  if (key === 'year') delete query.month;
  router.push({ path: '/search', query });
}

const hasQuery = computed(() => Boolean(keyword.value.trim()));
const hasFilter = computed(() => activeFilters.value.length > 0);

useSeoMeta({
  // 有具体搜索条件时不索引；空白搜索页允许索引（它就是一个「全部文章」入口）
  robots: () => (hasQuery.value || hasFilter.value ? 'noindex, follow' : 'index, follow'),
  title: () => (hasQuery.value ? `搜索：${keyword.value}` : '搜索'),
});
</script>

<template>
  <div class="container-page py-10">
    <header class="mb-8 max-w-2xl">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">搜索文章</h1>
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
        关键词会同时匹配标题与正文。
      </p>

      <form class="relative mt-5" role="search" @submit.prevent="submit">
        <svg
          class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          v-model="keyword"
          type="search"
          class="field py-2.5 pr-24 pl-11"
          placeholder="输入关键词，回车搜索"
          aria-label="搜索关键词"
        />
        <button type="submit" class="btn-primary btn-sm absolute top-1/2 right-1.5 -translate-y-1/2">
          搜索
        </button>
      </form>

      <div v-if="hasFilter" class="mt-4 flex flex-wrap items-center gap-2">
        <span class="text-xs text-slate-400">筛选：</span>
        <button
          v-for="f in activeFilters"
          :key="f.key"
          type="button"
          class="group inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs
                 text-slate-600 transition hover:border-rose-300 hover:text-rose-600
                 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          :title="`移除「${f.label}」筛选`"
          @click="removeFilter(f.key)"
        >
          <span class="text-slate-400">{{ f.label }}</span>
          <span class="font-medium">{{ f.value }}</span>
          <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </header>

    <ArticleFeed
      :filters="filters"
      variant="row"
      :show-sort="hasQuery || hasFilter"
      :empty-title="hasQuery ? `没有找到与「${keyword}」相关的文章` : '还没有文章'"
      empty-description="试试更短的关键词，或者去掉一些筛选条件。"
      empty-icon="search"
    >
      <template #empty>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <NuxtLink v-if="hasFilter" to="/search" class="btn-ghost btn-sm">清空筛选</NuxtLink>
          <NuxtLink to="/archives" class="btn-ghost btn-sm">按时间浏览</NuxtLink>
        </div>
      </template>
    </ArticleFeed>
  </div>
</template>
