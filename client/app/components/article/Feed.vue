<script setup lang="ts">
import type { ArticleListItemDto } from '~/types/api';
import type { Paginated } from '~/types/pagination';
import { ARTICLE_SORT_OPTIONS, type ArticleSort } from '~/types/domain';

/**
 * 可复用的文章列表流。
 *
 * 分类页、标签页、搜索页、作者主页本质上是**同一个列表接口 + 不同的筛选条件**，
 * 差别只有标题和筛选参数。把它抽出来，好处不只是少写三份代码 ——
 * 更重要的是「骨架屏 / 空状态 / 错误重试 / 分页」这些边界只会有一份实现，
 * 将来改一处就全都对，不会出现「搜索页有重试按钮、标签页忘了加」这种不一致。
 *
 * 筛选条件由调用方通过 `filters` 传入，只负责透传给后端。
 */
const props = withDefaults(
  defineProps<{
    /** 传给 GET /articles 的筛选参数（不含 page/pageSize/sort） */
    filters?: Record<string, string | number | undefined>;
    variant?: 'card' | 'row';
    showAuthor?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyIcon?: 'document' | 'search' | 'comment' | 'inbox';
    /** 是否显示排序切换 */
    showSort?: boolean;
  }>(),
  {
    filters: () => ({}),
    variant: 'card',
    showAuthor: true,
    emptyTitle: '没有找到文章',
    emptyDescription: '换个条件再试试。',
    emptyIcon: 'document',
    showSort: false,
  },
);

const route = useRoute();
const router = useRouter();
const api = useApi();
const { perPage } = useSettings();

const page = computed(() => {
  const n = Number(route.query.page);
  return Number.isInteger(n) && n > 0 ? n : 1;
});

const sort = computed<ArticleSort>(() => {
  const s = String(route.query.sort ?? 'latest');
  return (ARTICLE_SORT_OPTIONS.find((o) => o.value === s)?.value ?? 'latest') as ArticleSort;
});

/**
 * 缓存键。必须把**所有会影响结果的输入**都编进去，
 * 否则改了筛选条件后 useAsyncData 会认为数据没变而返回旧结果。
 * 用 JSON.stringify 序列化 filters，键顺序由传参决定、在同一次渲染内稳定。
 */
const cacheKey = computed(
  () => `feed-${JSON.stringify(props.filters)}-${sort.value}-${page.value}-${perPage.value}`,
);

const { data, status, error, refresh } = await useAsyncData(
  cacheKey,
  () =>
    api.get<Paginated<ArticleListItemDto>>('/articles', {
      query: {
        ...props.filters,
        sort: sort.value,
        page: page.value,
        pageSize: perPage.value,
      },
      anonymous: true,
    }),
  { watch: [cacheKey] },
);

const articles = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const totalPages = computed(() => data.value?.totalPages ?? 0);

/**
 * 把 URL query 归一成「干净的一维字符串表」。
 *
 * vue-router 的 LocationQuery 值可能是 null 或 string[]，直接展开进 query 会有两个问题：
 *   ① 类型对不上 `Record<string, string | number | undefined>`；
 *   ② 重复参数（?tag=a&tag=b）会被序列化成数组，后端只期望一个值。
 */
function cleanQuery(source: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      const first = value.find((item) => item !== null && item !== undefined);
      if (first !== undefined) out[key] = String(first);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') out[key] = value;
  }
  return out;
}

/** 排序切换写回 URL，保持「所有状态都在地址里」的一致性 */
function changeSort(value: string) {
  const query = cleanQuery(route.query);
  delete query.page; // 换排序后回到第一页，否则可能落在空页
  query.sort = value;
  return router.push({ path: route.path, query });
}

/** 翻页时要原样带上的查询参数（页码由分页组件自己决定，会覆盖同名键） */
const paginationQuery = computed(() => {
  const out = cleanQuery(route.query);
  for (const [key, value] of Object.entries(props.filters)) {
    if (value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
});
</script>

<template>
  <div>
    <div v-if="showSort || total" class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        共 <strong class="font-semibold text-slate-700 dark:text-slate-300">{{ total }}</strong> 篇
      </p>

      <div v-if="showSort" class="flex items-center gap-1.5">
        <button
          v-for="opt in ARTICLE_SORT_OPTIONS"
          :key="opt.value"
          type="button"
          class="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition"
          :class="
            sort === opt.value
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          "
          @click="changeSort(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 骨架 -->
    <div v-if="status === 'pending'" :class="variant === 'card' ? 'grid gap-5 sm:grid-cols-2' : 'space-y-1'">
      <div v-for="i in 4" :key="i" :class="variant === 'card' ? 'card overflow-hidden' : 'py-5'">
        <div v-if="variant === 'card'" class="skeleton aspect-[16/9] rounded-none" />
        <div :class="variant === 'card' ? 'space-y-3 p-5' : 'space-y-3'">
          <div class="skeleton h-4 w-1/3" />
          <div class="skeleton h-5 w-full" />
          <div class="skeleton h-4 w-4/5" />
        </div>
      </div>
    </div>

    <!-- 错误 -->
    <div
      v-else-if="error"
      class="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
    >
      <p class="font-medium">加载失败</p>
      <p class="mt-1">{{ error?.message }}</p>
      <button type="button" class="btn-ghost btn-sm mt-3" @click="refresh()">重试</button>
    </div>

    <!-- 空 -->
    <SiteEmptyState
      v-else-if="!articles.length"
      :icon="emptyIcon"
      :title="emptyTitle"
      :description="emptyDescription"
    >
      <slot name="empty" />
    </SiteEmptyState>

    <template v-else>
      <div :class="variant === 'card' ? 'grid gap-5 sm:grid-cols-2' : ''">
        <ArticleCard
          v-for="a in articles"
          :key="a.id"
          :article="a"
          :variant="variant"
          :show-author="showAuthor"
        />
      </div>

      <div class="mt-10">
        <SitePaginationBar :page="page" :total-pages="totalPages" :query="paginationQuery" />
      </div>
    </template>
  </div>
</template>
