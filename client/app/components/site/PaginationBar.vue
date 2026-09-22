<script setup lang="ts">
/**
 * 分页条。
 *
 * 两个刻意的设计：
 *
 * ① **全部用 NuxtLink（真 <a>），没有 emit 事件。**
 *    页码存在 URL query 里（?page=2），每页都能被收录、能分享、返回键符合直觉。
 *    如果用「点击 → emit → 父组件重新请求」，链接就变成了 <button>，
 *    爬虫抓不到第 2 页之后的内容 —— 分页对 SEO 的价值直接归零。
 *
 * ② **页码窗口而不是全列。**
 *    归档页可能有几十页，全列出来节点过多反而点不准。
 *    这里用「首尾 + 当前附近 + 省略号」的经典策略。
 */
import type { LocationQueryRaw } from 'vue-router';

const props = withDefaults(
  defineProps<{
    page: number;
    totalPages: number;
    /** 当前列表的其它查询参数，翻页时原样带上（关键词、分类等） */
    query?: Record<string, string | number | undefined>;
  }>(),
  { query: () => ({}) },
);

const route = useRoute();

/** 生成页码序列，0 表示省略号 */
const items = computed<(number | 0)[]>(() => {
  const total = props.totalPages;
  const cur = props.page;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out: (number | 0)[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);

  if (start > 2) out.push(0);
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push(0);
  out.push(total);
  return out;
});

/** 每页的 URL。第一页不带 page 参数，避免 /articles 与 /articles?page=1 两份内容 */
function linkTo(p: number) {
  const q: LocationQueryRaw = {};
  for (const [k, v] of Object.entries(props.query)) {
    if (v !== undefined && v !== '' && k !== 'page') q[k] = String(v);
  }
  if (p > 1) q.page = String(p);
  return { path: route.path, query: q };
}

const disabledPrev = computed(() => props.page <= 1);
const disabledNext = computed(() => props.page >= props.totalPages);

const box =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm transition';
const idle =
  'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-brand-700 dark:hover:text-brand-300';
const dead = 'border-slate-200 bg-white text-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-700';
const active = 'border-brand-600 bg-brand-600 font-medium text-white';
</script>

<template>
  <nav v-if="totalPages > 1" class="flex items-center justify-center gap-1.5" aria-label="分页">
    <!-- 首/末页仍是可点链接，禁用态用 span 而不是 disabled button：
         disabled 的 <a> 在 HTML 里不成立，靠 CSS 装作不可点反而更清楚 -->
    <NuxtLink
      v-if="!disabledPrev"
      :to="linkTo(page - 1)"
      :class="[box, idle]"
      rel="prev"
      aria-label="上一页"
    >
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="m15 6-6 6 6 6" />
      </svg>
    </NuxtLink>
    <span v-else :class="[box, dead]" aria-hidden="true">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="m15 6-6 6 6 6" />
      </svg>
    </span>

    <template v-for="(item, i) in items" :key="`${item}-${i}`">
      <span v-if="item === 0" class="px-1 text-slate-400">…</span>
      <NuxtLink
        v-else
        :to="linkTo(item)"
        :class="[box, item === page ? active : idle]"
        :aria-current="item === page ? 'page' : undefined"
      >
        {{ item }}
      </NuxtLink>
    </template>

    <NuxtLink
      v-if="!disabledNext"
      :to="linkTo(page + 1)"
      :class="[box, idle]"
      rel="next"
      aria-label="下一页"
    >
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </NuxtLink>
    <span v-else :class="[box, dead]" aria-hidden="true">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </span>
  </nav>
</template>
