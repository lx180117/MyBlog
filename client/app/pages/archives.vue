<script setup lang="ts">
import type { ArticleListItemDto } from '~/types/api';

/**
 * 归档页（FR-3.3）：按年 / 月聚合的时间线。
 *
 * 用 `/articles/archives` 而不是 `/articles`：聚合在数据库里做完再返回，
 * 前端不必把上千篇文章拉下来自己分组。
 *
 * ⚠️ 这里要说明一个**接口契约上的缺口**，以及我为什么这么绕：
 *
 * `/articles/archives` 接受 `page` / `pageSize`，但响应是**裸数组**
 * `[{ year, month, count, articles }]`，**不带任何分页元信息**。
 * 也就是说前端拿不到 total / totalPages，没法知道「还有没有下一页」，
 * 也没法渲染页码条。
 *
 * 所以这里退化为「加载更多」的累加模式，用**「本页是否被填满」**来判断
 * 是否还有下一页：返回分组数 == pageSize 说明可能还有，继续请求；
 * 一旦返回不足 pageSize，就认为到底了。这是对无总数分页接口的标准适配方式。
 *
 * 更彻底的做法是让后端把 archives 也返回成 `{ items, total, page, pageSize, totalPages }`
 * （与其它列表接口统一）。那会改动 Step 5 的接口契约，我没有单方面改 ——
 * 前端这段适配是自洽的，但记在这里，等你决定要不要统一。
 */
const api = useApi();
const { load: loadSettings } = useSettings();

await loadSettings();

interface ArchiveGroup {
  year: number;
  month: number;
  count: number;
  articles: ArticleListItemDto[];
}

const PAGE_SIZE = 12;

const servedSize = ref(PAGE_SIZE);
const page = ref(1);
const groups = ref<ArchiveGroup[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const exhausted = ref(false);

async function fetchPage() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await api.get<ArchiveGroup[]>('/articles/archives', {
      // 起始用 SSR 渲染出的 pageSize（120），加载更多时回到正常批次大小
      query: { page: page.value, pageSize: servedSize.value, sort: 'latest' },
      anonymous: true,
    });

    if (page.value === 1) groups.value = res;
    else groups.value = [...groups.value, ...res];

    // 没填满一页 → 后面没有了
    exhausted.value = res.length < servedSize.value;
    servedSize.value = PAGE_SIZE;
  } catch (e) {
    loadError.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

// 首屏由 SSR 完成：一次多拿几组，避免读者一进页面就要点「加载更多」
const { status } = await useAsyncData('archives-first', async () => {
  servedSize.value = PAGE_SIZE * 10;
  await fetchPage();
  return true;
});

async function loadMore() {
  page.value += 1;
  await fetchPage();
}

useSeoMeta({
  title: '归档',
  description: '按时间浏览全部已发布文章。',
});
</script>

<template>
  <div class="container-page py-10">
    <header class="mb-8">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">归档</h1>
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">按时间倒序浏览，每个月一组。</p>
    </header>

    <div v-if="status === 'pending'" class="space-y-8">
      <div v-for="i in 3" :key="i" class="space-y-3">
        <div class="skeleton h-5 w-32" />
        <div v-for="j in 3" :key="j" class="skeleton h-4 w-2/3" />
      </div>
    </div>

    <SiteEmptyState
      v-else-if="!groups.length && !loadError"
      icon="inbox"
      title="还没有可归档的文章"
      description="等第一篇文章发布后，这里会按月份自动整理。"
    />

    <div v-else class="space-y-10">
      <section v-for="g in groups" :key="`${g.year}-${g.month}`">
        <!-- 年月标题指向搜索页的筛选形态：某个分组带不下的文章可在那里看全 -->
        <NuxtLink
          :to="`/search?year=${g.year}&month=${g.month}`"
          class="group inline-flex items-baseline gap-2.5"
        >
          <h2
            class="text-lg font-semibold text-slate-900 transition group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400"
          >
            {{ g.year }} 年 {{ g.month }} 月
          </h2>
          <span class="text-xs text-slate-400">{{ g.count }} 篇</span>
        </NuxtLink>

        <ul class="mt-3 border-l-2 border-slate-100 pl-5 dark:border-slate-800">
          <li v-for="a in g.articles" :key="a.id" class="py-2">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <NuxtLink
                :to="`/articles/${a.slug}`"
                class="text-[15px] text-slate-700 transition hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-400"
              >
                {{ a.title }}
              </NuxtLink>
              <span class="text-xs text-slate-400">{{ a.publishedAt?.slice(0, 10) }}</span>
            </div>
          </li>
        </ul>

        <p v-if="g.count > g.articles.length" class="mt-2 pl-5 text-xs text-slate-400">
          仅显示最近 {{ g.articles.length }} 篇，共 {{ g.count }} 篇 ——
          <NuxtLink :to="`/search?year=${g.year}&month=${g.month}`" class="text-brand-600 hover:underline dark:text-brand-400">
            查看全部
          </NuxtLink>
        </p>
      </section>
    </div>

    <p v-if="loadError" class="mt-8 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      {{ loadError }}
    </p>

    <div v-if="groups.length && !exhausted" class="mt-10 text-center">
      <button type="button" class="btn-ghost" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中…' : '加载更早的月份' }}
      </button>
    </div>

    <p v-else-if="groups.length && exhausted" class="mt-10 text-center text-xs text-slate-400">
      已经到底了
    </p>
  </div>
</template>
