<script setup lang="ts">
import type { ArticleListItemDto, CategoryResponseDto, TagResponseDto } from '~/types/api';
import type { Paginated } from '~/types/pagination';

/**
 * 首页：文章流 + 侧栏。
 *
 * 分页与筛选全部走 URL query，SSR 直接渲染出当页内容 —— 这一步对 SEO 是关键，
 * 搜索引擎拿到的是成品 HTML，不是空壳。
 */
const route = useRoute();
const api = useApi();
const { siteName, siteDescription, perPage, load: loadSettings } = useSettings();
const { categories, tags, loadTaxonomy } = useTaxonomy();

await Promise.all([loadSettings(), loadTaxonomy()]);

const page = computed(() => {
  const n = Number(route.query.page);
  return Number.isInteger(n) && n > 0 ? n : 1;
});

const { data, status, error, refresh } = await useAsyncData(
  () => `home-${page.value}-${perPage.value}`,
  () =>
    api.get<Paginated<ArticleListItemDto>>('/articles', {
      query: { page: page.value, pageSize: perPage.value, sort: 'latest' },
      anonymous: true,
    }),
  { watch: [page, perPage] },
);

const articles = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const totalPages = computed(() => data.value?.totalPages ?? 0);

// 热门的几个标签，按文章数排；标签太多时只展示前 20 个，避免侧栏被撑爆
const topTags = computed(() => [...tags.value].sort((a, b) => b.articleCount - a.articleCount).slice(0, 20));

useHead({
  // 首页标题用「站点名 · 副标题」。app.vue 的 titleTemplate 检测到已含站点名就不再追加，
  // 所以这里显式带上站点名是安全的，也是 SEO 上更想看到的形态
  title: siteDescription.value ? `${siteName.value} · ${siteDescription.value}` : siteName.value,
  link: [{ rel: 'canonical', href: `${useRuntimeConfig().public.siteUrl}/` }],
  meta: [{ name: 'description', content: siteDescription.value || siteName.value }],
});
</script>

<template>
  <div class="container-page py-10">
    <!-- 站点简介：只在第一页显示，翻页时省掉这块的视觉噪声 -->
    <section v-if="page === 1 && siteDescription" class="mb-10 max-w-2xl">
      <h1 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-50">
        {{ siteName }}
      </h1>
      <p class="mt-3 text-base leading-relaxed text-slate-500 dark:text-slate-400">
        {{ siteDescription }}
      </p>
    </section>

    <div class="flex flex-col gap-10 lg:flex-row">
      <!-- 主列 -->
      <div class="min-w-0 flex-1">
        <!-- 首屏骨架：首屏数据到位前占位，避免布局跳动 -->
        <div v-if="status === 'pending'" class="grid gap-5 sm:grid-cols-2">
          <div v-for="i in 4" :key="i" class="card overflow-hidden">
            <div class="skeleton aspect-[16/9] rounded-none" />
            <div class="space-y-3 p-5">
              <div class="skeleton h-4 w-1/3" />
              <div class="skeleton h-5 w-full" />
              <div class="skeleton h-4 w-4/5" />
            </div>
          </div>
        </div>

        <div
          v-else-if="error"
          class="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <p class="font-medium">文章列表加载失败</p>
          <p class="mt-1">{{ error?.message }}</p>
          <button type="button" class="btn-ghost btn-sm mt-3" @click="refresh()">重试</button>
        </div>

        <SiteEmptyState
          v-else-if="!articles.length"
          icon="document"
          title="还没有已发布的文章"
          description="等第一位作者发出第一篇文章，这里就会有内容了。"
        >
          <NuxtLink to="/register" class="btn-primary btn-sm">注册成为作者</NuxtLink>
        </SiteEmptyState>

        <template v-else>
          <div class="grid gap-5 sm:grid-cols-2">
            <ArticleCard v-for="a in articles" :key="a.id" :article="a" />
          </div>

          <div class="mt-10">
            <SitePaginationBar :page="page" :total-pages="totalPages" />
          </div>

          <p v-if="total" class="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            共 {{ total }} 篇文章
          </p>
        </template>
      </div>

      <!-- 侧栏 -->
      <aside class="w-full shrink-0 lg:w-64">
        <div class="space-y-6 lg:sticky lg:top-24">
          <SiteSiteSummaryCard />

          <section v-if="categories.length" class="card p-5">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">分类</h2>
            <ul class="mt-3 space-y-1">
              <li v-for="c in categories" :key="c.id">
                <NuxtLink
                  :to="`/categories/${c.slug}`"
                  class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-600 transition
                         hover:bg-slate-50 hover:text-brand-700
                         dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-brand-300"
                >
                  <span class="truncate">{{ c.name }}</span>
                  <span class="ml-2 shrink-0 text-xs text-slate-400">{{ c.articleCount }}</span>
                </NuxtLink>
              </li>
            </ul>
          </section>

          <section v-if="topTags.length" class="card p-5">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">标签</h2>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <NuxtLink v-for="t in topTags" :key="t.id" :to="`/tags/${t.slug}`" class="tag-chip">
                {{ t.name }}
              </NuxtLink>
            </div>
          </section>

          <section class="card p-5">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">订阅</h2>
            <p class="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              用 RSS 阅读器订阅，新文章会自动推送给你。
            </p>
            <SiteRssLink class="mt-3 inline-block text-xs" />
          </section>
        </div>
      </aside>
    </div>
  </div>
</template>
