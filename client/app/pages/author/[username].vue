<script setup lang="ts">
import type { AuthorProfilePageDto } from '~/types/api';
import { formatCount, formatDate } from '~/utils/format';

/**
 * 作者主页（FR-1.5）：`/author/{username}`。
 *
 * 一次请求同时拿到作者资料与他的文章列表（后端 findAuthorProfile 的设计），
 * 所以这一页不需要并发两个接口，首屏少一次往返。
 *
 * `articles` 字段里内嵌了每篇文章的作者信息 —— 在自己的主页里显示「作者是我自己」
 * 是冗余的，所以传 showAuthor=false 给列表卡片。
 */
definePageMeta({ key: (route) => route.fullPath });

const route = useRoute();
const api = useApi();
const { load: loadSettings } = useSettings();

const username = computed(() => String(route.params.username));

await loadSettings();

const page = ref(1);

const { data, status, error } = await useAsyncData(
  () => `author-${username.value}-${page.value}`,
  () =>
    api.get<AuthorProfilePageDto>(`/authors/${encodeURIComponent(username.value)}`, {
      query: { page: page.value, pageSize: 12 },
      anonymous: true,
    }),
  { watch: [username, page] },
);

const profile = computed(() => data.value?.author ?? null);

if (!data.value) {
  throw createError({
    statusCode: 404,
    message: error.value?.message || '该作者不存在',
  });
}

const articles = computed(() => data.value?.articles ?? []);
const total = computed(() => data.value?.total ?? 0);
const totalPages = computed(() => data.value?.totalPages ?? 0);

const stats = computed(() => {
  const p = profile.value;
  if (!p) return [];
  return [
    { label: '文章', value: p.articleCount },
    { label: '获赞', value: p.totalLikes },
    { label: '被阅读', value: p.totalViews },
  ];
});

useSeoMeta({
  title: () => `${profile.value?.nickname ?? ''} 的主页`,
  description: () =>
    profile.value?.bio || `${profile.value?.nickname ?? ''} 在本站发布的 ${profile.value?.articleCount ?? 0} 篇文章。`,
});
</script>

<template>
  <div class="container-page py-10">
    <div v-if="status === 'pending'" class="space-y-6">
      <div class="flex items-start gap-5">
        <div class="skeleton size-20 rounded-full" />
        <div class="flex-1 space-y-3 pt-2">
          <div class="skeleton h-6 w-40" />
          <div class="skeleton h-4 w-2/3" />
        </div>
      </div>
      <div class="skeleton h-32 w-full" />
    </div>

    <template v-else-if="profile">
      <!-- 作者名片区 -->
      <header class="flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-start dark:border-slate-800">
        <SiteAuthorAvatar
          :src="profile.avatarUrl"
          :name="profile.nickname"
          :seed="profile.username"
          :size="80"
          ring
        />

        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {{ profile.nickname }}
          </h1>
          <p class="mt-1 font-mono text-sm text-slate-400">@{{ profile.username }}</p>

          <p v-if="profile.bio" class="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {{ profile.bio }}
          </p>

          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            <span class="flex items-center gap-1.5">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
                <rect x="3.5" y="5" width="17" height="16" rx="2" />
                <path d="M3.5 10h17M8 3v4M16 3v4" />
              </svg>
              {{ formatDate(profile.joinedAt) }} 加入
            </span>

            <a
              v-if="profile.website"
              :href="profile.website"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1.5 transition hover:text-brand-600 dark:hover:text-brand-400"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
              </svg>
              个人主页
            </a>

            <a
              v-if="profile.github"
              :href="profile.github"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1.5 transition hover:text-brand-600 dark:hover:text-brand-400"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
              GitHub
            </a>
          </div>

          <dl v-if="stats.length" class="mt-5 flex flex-wrap gap-6">
            <div v-for="s in stats" :key="s.label">
              <dt class="text-xs text-slate-400">{{ s.label }}</dt>
              <dd class="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {{ formatCount(s.value) }}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <!-- 文章列表 -->
      <section class="mt-8">
        <h2 class="mb-5 text-sm font-semibold tracking-wide text-slate-400 uppercase">
          发布的文章
        </h2>

        <SiteEmptyState
          v-if="!articles.length"
          icon="document"
          title="这位作者还没有发布文章"
          description="等他发出第一篇。"
        />

        <template v-else>
          <div class="space-y-0">
            <ArticleCard
              v-for="a in articles"
              :key="a.id"
              :article="a"
              variant="row"
              :show-author="false"
            />
          </div>

          <div class="mt-10">
            <SitePaginationBar :page="page" :total-pages="totalPages" />
          </div>

          <p class="mt-4 text-center text-xs text-slate-400">共 {{ total }} 篇文章</p>
        </template>
      </section>
    </template>
  </div>
</template>
