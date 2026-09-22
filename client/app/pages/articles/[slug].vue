<script setup lang="ts">
import type { ArticleDetailDto, ViewResultDto } from '~/types/api';
import { estimateReadingMinutes, formatCount, formatDate } from '~/utils/format';
import { hydrateArticleDom } from '~/utils/content';

/**
 * 文章详情页（SSR）。
 *
 * 这一页有三处必须按顺序想清楚的地方，都写在下面：
 *
 * ① **公开数据 SSR 渲染**，保证爬虫拿到完整正文 → SEO 需求（FR-7.5）。
 *    但 `likedByMe` / `canEdit` 依赖请求方身份，SSR 时只能给 false。
 *    所以挂载后再带令牌重新取一次，把这两个字段纠正过来。
 *    正文 HTML 不变，不会闪。
 *
 * ② **正文的 DOM 后处理**（标题锚点 + 代码高亮）必须在挂载后跑。
 *    后端 renderMarkdown 有意不生成 heading id、也不做高亮，
 *    把这两件事留给前端（原因见 server/src/common/utils/markdown.util.ts）。
 *
 * ③ **阅读量上报**放在挂载后异步发，不阻塞首屏。
 *    它只是计数，失败也不该影响阅读。
 */
const route = useRoute();
const api = useApi();
const auth = useAuth();
const config = useRuntimeConfig();
const { load: loadSettings } = useSettings();

const slug = computed(() => String(route.params.slug));

const { data, error } = await useAsyncData(`article-${slug.value}`, () =>
  api.get<ArticleDetailDto>(`/articles/${encodeURIComponent(slug.value)}`, { anonymous: true }),
);

// 先取出再判空：这样 TS 的类型收窄才可靠（对 data.value 这类访问器属性的收窄容易失效）
const article = data.value;

// 文章不存在 → 交给 error.vue 渲染 404，而不是渲染一个空页面
if (!article) {
  throw createError({
    statusCode: 404,
    // 用 message 而不是 statusMessage：Nuxt 4 起 statusMessage 会被净化，
    // 中文提示会被替换掉（构建时也会打 deprecation 警告）
    message: error.value?.message || '文章不存在或已被删除',
  });
}

const bodyRef = ref<HTMLElement | null>(null);

function hydrate() {
  // 再判一次 article：上面的 throw 已经保证它存在，但那是**模块顶层**的收窄，
  // 在函数闭包里 TS 不保证仍然成立（noUncheckedIndexedAccess 下会直接报错）
  if (!bodyRef.value || !article) return;
  hydrateArticleDom(
    bodyRef.value,
    article.toc?.map((t) => t.anchor),
  );
}

onMounted(async () => {
  hydrate();

  // ① 带令牌重取，纠正 likedByMe / canEdit
  if (auth.isLoggedIn.value) {
    try {
      const fresh = await api.get<ArticleDetailDto>(`/articles/${encodeURIComponent(slug.value)}`);
      article.likedByMe = fresh.likedByMe;
      article.canEdit = fresh.canEdit;
    } catch {
      // 失败不影响阅读，保留 SSR 的结果
    }
  }

  // ③ 阅读量上报。后端按 IP + 时间窗去重，重复刷新不会无限涨
  try {
    await api.post<ViewResultDto>(`/articles/${article.id}/view`, undefined, { anonymous: true });
  } catch {
    /* 计数失败无所谓 */
  }
});

// 目录数据变化时（极少见）重新处理 DOM
watch(() => article.toc, hydrate);

const readingMinutes = computed(() => estimateReadingMinutes(article.content));

const shareUrl = computed(() => `${config.public.siteUrl}/articles/${article.slug}`);

useSeoMeta({
  title: article.title,
  description: article.summary,
  ogTitle: article.title,
  ogDescription: article.summary,
  ogType: 'article',
  ogUrl: shareUrl.value,
  ogImage: article.coverUrl || undefined,
  articlePublishedTime: article.publishedAt || undefined,
  articleModifiedTime: article.updatedAt,
  articleAuthor: [article.author.nickname],
  twitterCard: article.coverUrl ? 'summary_large_image' : 'summary',
});

useHead({
  link: [{ rel: 'canonical', href: shareUrl.value }],
  script: [
    {
      type: 'application/ld+json',
      // 结构化数据让搜索结果能带作者与时间，比纯标题点击率高
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title,
        description: article.summary,
        datePublished: article.publishedAt,
        dateModified: article.updatedAt,
        author: {
          '@type': 'Person',
          name: article.author.nickname,
          url: `${config.public.siteUrl}/author/${article.author.username}`,
        },
        image: article.coverUrl || undefined,
        wordCount: article.content.length,
      }),
    },
  ],
});

await loadSettings();
</script>

<template>
  <div class="container-page py-10">
    <!-- 面包屑：既帮读者定位，也让搜索引擎理解层级 -->
    <nav class="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-slate-400" aria-label="面包屑">
      <NuxtLink to="/" class="transition hover:text-slate-600 dark:hover:text-slate-300">首页</NuxtLink>
      <template v-if="article.category">
        <span>/</span>
        <NuxtLink
          :to="`/categories/${article.category.slug}`"
          class="transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          {{ article.category.name }}
        </NuxtLink>
      </template>
    </nav>

    <div class="flex flex-col gap-12 lg:flex-row">
      <!-- 正文列 -->
      <article class="min-w-0 flex-1">
        <header>
          <h1 class="text-3xl leading-tight font-bold tracking-tight text-slate-900 sm:text-[2.1rem] dark:text-slate-50">
            {{ article.title }}
          </h1>

          <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            <NuxtLink
              :to="`/author/${article.author.username}`"
              class="flex items-center gap-2 transition hover:text-slate-800 dark:hover:text-slate-200"
            >
              <SiteAuthorAvatar
                :src="article.author.avatarUrl"
                :name="article.author.nickname"
                :seed="article.author.username"
                :size="26"
              />
              <span class="font-medium">{{ article.author.nickname }}</span>
            </NuxtLink>

            <span v-if="article.publishedAt" class="flex items-center gap-1.5">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
                <rect x="3.5" y="5" width="17" height="16" rx="2" />
                <path d="M3.5 10h17M8 3v4M16 3v4" />
              </svg>
              <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
            </span>

            <span class="flex items-center gap-1.5">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
              {{ formatCount(article.viewCount) }}
            </span>

            <span class="text-slate-400 dark:text-slate-500">约 {{ readingMinutes }} 分钟读完</span>

            <!-- canEdit 由服务端判定（作者本人或管理员），前端不做权限猜测 -->
            <NuxtLink
              v-if="article.canEdit"
              :to="`/dashboard/articles/${article.id}`"
              class="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs
                     text-slate-600 transition hover:border-brand-300 hover:text-brand-700
                     dark:border-slate-700 dark:text-slate-400 dark:hover:border-brand-700 dark:hover:text-brand-300"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              编辑
            </NuxtLink>
          </div>

          <div v-if="article.tags?.length" class="mt-4 flex flex-wrap gap-1.5">
            <NuxtLink v-for="t in article.tags" :key="t.slug" :to="`/tags/${t.slug}`" class="tag-chip">
              {{ t.name }}
            </NuxtLink>
          </div>
        </header>

        <img
          v-if="article.coverUrl"
          :src="article.coverUrl"
          :alt="article.title"
          class="mt-8 w-full rounded-xl border border-slate-200 dark:border-slate-800"
        />

        <!--
          正文。contentHtml 是后端用 marked 渲染 + sanitize-html 白名单过滤后的结果，
          所以这里可以安全地 v-html —— 净化发生在服务端，且是缓存过的，
          不必在每个读者的浏览器里再跑一次。
        -->
        <div ref="bodyRef" class="prose-blog mt-9" v-html="article.contentHtml" />

        <ArticleActions
          :article-id="article.id"
          :like-count="article.likeCount"
          :view-count="article.viewCount"
          :initial-liked="article.likedByMe"
        />

        <!-- 作者名片 -->
        <aside class="mt-12 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-start gap-4">
            <SiteAuthorAvatar
              :src="article.author.avatarUrl"
              :name="article.author.nickname"
              :seed="article.author.username"
              :size="52"
            />
            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="`/author/${article.author.username}`"
                class="font-semibold text-slate-900 transition hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
              >
                {{ article.author.nickname }}
              </NuxtLink>
              <p v-if="article.authorBio" class="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {{ article.authorBio }}
              </p>
              <div class="mt-3 flex flex-wrap gap-3 text-xs">
                <NuxtLink
                  :to="`/author/${article.author.username}`"
                  class="font-medium text-brand-600 transition hover:underline dark:text-brand-400"
                >
                  查看全部文章
                </NuxtLink>
                <a
                  v-if="article.authorGithub"
                  :href="article.authorGithub"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </aside>

        <CommentSection :article-id="article.id" />
      </article>

      <!-- 目录侧栏。目录为空时不占位（短文本来就没有 h2 以上标题） -->
      <aside v-if="article.toc?.length" class="hidden w-56 shrink-0 lg:block">
        <div class="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <ArticleToc :items="article.toc" />
        </div>
      </aside>
    </div>
  </div>
</template>
