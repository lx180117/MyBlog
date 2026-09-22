<script setup lang="ts">
import { formatCount } from '~/utils/format';

/**
 * 关于页。
 *
 * 内容全部来自后台配置（站点名/描述/社交链接）+ 公开统计，
 * 不做成「可编辑的富文本页面」—— 需求里没有单页管理（FR-7.1 只要求有这一页），
 * 为了一个静态页面加一套单页 CRUD 数据表和接口，性价比不成立。
 * 内容要改，改后台的站点描述即可。
 *
 * 如果哪天真的需要独立内容，正确的做法是给 articles 加一个 `is_page` 标记，
 * 而不是新建 page 表 —— 那会重复实现一遍 Markdown 渲染、SEO、评论这些已有能力。
 */
const { siteName, siteDescription, settings, summary, load, loadSummary } = useSettings();
const auth = useAuth();

await Promise.all([load(), loadSummary()]);

const socialLinks = computed(() => settings.value?.socialLinks ?? []);

const stats = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { label: '已发布文章', value: s.articleCount, suffix: '篇' },
    { label: '活跃作者', value: s.authorCount, suffix: '位' },
    { label: '读者评论', value: s.commentCount, suffix: '条' },
    { label: '累计阅读', value: s.viewCount, suffix: '次' },
  ];
});

/** 这个站的技术栈，写在关于页里——技术博客的读者会想知道 */
const stack = [
  { name: 'Nuxt 4', note: '前台服务端渲染，保证搜索引擎收录' },
  { name: 'NestJS', note: '后端 API，OpenAPI 文档驱动前端类型' },
  { name: 'PostgreSQL', note: '原生全文检索，中文走 pg_trgm 三元组索引' },
  { name: 'Prisma', note: '类型安全的数据访问层' },
];

useSeoMeta({
  title: '关于',
  description: () => siteDescription.value || `关于 ${siteName.value}`,
});
</script>

<template>
  <div class="container-page py-10">
    <div class="mx-auto max-w-3xl">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        关于 {{ siteName }}
      </h1>

      <p v-if="siteDescription" class="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-400">
        {{ siteDescription }}
      </p>

      <p class="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-400">
        这是一个多作者协作的写作平台。每位作者用自己的账号登录、各写各的内容，
        文章与评论都记在作者名下；读者可以直接在文章下留言讨论。
      </p>

      <!-- 站点数据 -->
      <section v-if="stats.length" class="mt-10">
        <h2 class="text-sm font-semibold tracking-wide text-slate-400 uppercase">站点数据</h2>
        <dl class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div
            v-for="s in stats"
            :key="s.label"
            class="card px-4 py-3"
          >
            <dt class="text-xs text-slate-500 dark:text-slate-400">{{ s.label }}</dt>
            <dd class="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {{ formatCount(s.value) }}
              <span class="text-xs font-normal text-slate-400">{{ s.suffix }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <!-- 技术栈 -->
      <section class="mt-10">
        <h2 class="text-sm font-semibold tracking-wide text-slate-400 uppercase">本站怎么搭的</h2>
        <ul class="mt-4 space-y-3">
          <li
            v-for="item in stack"
            :key="item.name"
            class="flex flex-col gap-1 border-b border-slate-100 pb-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4 dark:border-slate-800"
          >
            <span class="w-32 shrink-0 font-mono text-sm font-medium text-slate-800 dark:text-slate-200">
              {{ item.name }}
            </span>
            <span class="text-sm text-slate-500 dark:text-slate-400">{{ item.note }}</span>
          </li>
        </ul>
      </section>

      <!-- 订阅与联系 -->
      <section class="mt-10">
        <h2 class="text-sm font-semibold tracking-wide text-slate-400 uppercase">订阅与联系</h2>
        <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <SiteRssLink />
          <a
            v-for="link in socialLinks"
            :key="link.url"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
          >
            {{ link.name }}
          </a>
        </div>
      </section>

      <!-- 想写点什么的人 -->
      <section class="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">想在这里写文章？</h2>
        <p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          注册后需要管理员审核激活，通过之后就能发文、管理自己的评论。
          每个作者只对自己的内容有权限，互相看不到对方的草稿。
        </p>
        <div class="mt-4 flex flex-wrap gap-3">
          <ClientOnly>
            <template v-if="!auth.isLoggedIn.value">
              <NuxtLink to="/register" class="btn-primary btn-sm">注册账号</NuxtLink>
              <NuxtLink to="/login" class="btn-ghost btn-sm">已有账号，登录</NuxtLink>
            </template>
            <template v-else>
              <NuxtLink to="/dashboard/articles/new" class="btn-primary btn-sm">去写文章</NuxtLink>
            </template>
            <template #fallback>
              <div class="h-8 w-40" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>
  </div>
</template>
