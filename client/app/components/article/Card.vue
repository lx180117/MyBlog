<script setup lang="ts">
import type { ArticleListItemDto } from '~/types/api';
import { formatCount, formatDate } from '~/utils/format';

/**
 * 列表里的文章卡片。
 *
 * 有意做成两个形态：
 *  - `card`：首页 / 分类 / 标签页用，带封面，视觉更重
 *  - `row`：搜索结果、归档、作者主页用，信息密度更高
 * 一份数据两种呈现，避免列表页各自手写一遍字段拼装。
 */
withDefaults(
  defineProps<{
    article: ArticleListItemDto;
    variant?: 'card' | 'row';
    /** 是否显示作者（作者主页里就不需要重复显示作者是谁） */
    showAuthor?: boolean;
  }>(),
  { variant: 'card', showAuthor: true },
);
</script>

<template>
  <article
    :class="
      variant === 'card'
        ? 'card card-hover group overflow-hidden'
        : 'group flex gap-4 border-b border-slate-100 py-5 last:border-b-0 dark:border-slate-800'
    "
  >
    <!-- 卡片形态的封面 -->
    <NuxtLink
      v-if="variant === 'card' && article.coverUrl"
      :to="`/articles/${article.slug}`"
      class="block aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-800"
    >
      <img
        :src="article.coverUrl"
        :alt="article.title"
        loading="lazy"
        class="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
      />
    </NuxtLink>

    <!-- row 形态的缩略图 -->
    <NuxtLink
      v-else-if="variant === 'row' && article.coverUrl"
      :to="`/articles/${article.slug}`"
      class="hidden size-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:block dark:bg-slate-800"
    >
      <img :src="article.coverUrl" :alt="article.title" loading="lazy" class="size-full object-cover" />
    </NuxtLink>

    <div :class="variant === 'card' ? 'p-5' : 'min-w-0 flex-1'">
      <!-- 置顶 / 分类 -->
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span
          v-if="article.isTop"
          class="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700
                 dark:bg-amber-950/40 dark:text-amber-400"
        >
          置顶
        </span>
        <NuxtLink
          v-if="article.category"
          :to="`/categories/${article.category.slug}`"
          class="text-xs font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {{ article.category.name }}
        </NuxtLink>
      </div>

      <h3
        :class="
          variant === 'card'
            ? 'line-clamp-2 text-[17px] leading-snug font-semibold'
            : 'line-clamp-2 text-[16px] leading-snug font-semibold'
        "
      >
        <NuxtLink
          :to="`/articles/${article.slug}`"
          class="text-slate-900 transition group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400"
        >
          {{ article.title }}
        </NuxtLink>
      </h3>

      <p
        v-if="article.summary"
        :class="
          variant === 'card'
            ? 'mt-2 line-clamp-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400'
            : 'mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400'
        "
      >
        {{ article.summary }}
      </p>

      <!-- 标签 -->
      <div v-if="article.tags?.length" class="mt-3 flex flex-wrap gap-1.5">
        <NuxtLink
          v-for="tag in article.tags.slice(0, variant === 'card' ? 4 : 6)"
          :key="tag.slug"
          :to="`/tags/${tag.slug}`"
          class="tag-chip"
        >
          {{ tag.name }}
        </NuxtLink>
      </div>

      <!-- 元信息 -->
      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400 dark:text-slate-500">
        <NuxtLink
          v-if="showAuthor"
          :to="`/author/${article.author.username}`"
          class="flex items-center gap-1.5 transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          <SiteAuthorAvatar
            :src="article.author.avatarUrl"
            :name="article.author.nickname"
            :seed="article.author.username"
            :size="18"
          />
          {{ article.author.nickname }}
        </NuxtLink>

        <span v-if="article.publishedAt" class="flex items-center gap-1">
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <rect x="3.5" y="5" width="17" height="16" rx="2" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
          <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>
        </span>

        <span class="flex items-center gap-1" :title="`${article.viewCount} 次阅读`">
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
          {{ formatCount(article.viewCount) }}
        </span>

        <span v-if="article.commentCount > 0" class="flex items-center gap-1" :title="`${article.commentCount} 条评论`">
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
            <path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" />
          </svg>
          {{ formatCount(article.commentCount) }}
        </span>

        <span v-if="article.likeCount > 0" class="flex items-center gap-1" :title="`${article.likeCount} 次点赞`">
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
            <path d="M7 22V11l5-9a2.5 2.5 0 0 1 2.4 3.2L13 11h5.3a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6Z" />
            <path d="M7 11H3v11h4" />
          </svg>
          {{ formatCount(article.likeCount) }}
        </span>
      </div>
    </div>
  </article>
</template>
