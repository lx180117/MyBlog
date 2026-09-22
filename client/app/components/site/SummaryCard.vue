<script setup lang="ts">
import { formatCount } from '~/utils/format';

/**
 * 侧栏的站点概览卡片（GET /site/summary）。
 * 数据在 useSettings 里共享，多个页面同时用也只请求一次。
 */
const { summary, loadSummary } = useSettings();

await loadSummary();

const items = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { label: '文章', value: s.articleCount },
    { label: '作者', value: s.authorCount },
    { label: '评论', value: s.commentCount },
    { label: '阅读', value: s.viewCount },
  ];
});
</script>

<template>
  <section v-if="items.length" class="card p-5">
    <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">站点概览</h2>
    <dl class="mt-3 grid grid-cols-2 gap-3">
      <div
        v-for="item in items"
        :key="item.label"
        class="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60"
      >
        <dt class="text-xs text-slate-500 dark:text-slate-400">{{ item.label }}</dt>
        <dd class="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {{ formatCount(item.value) }}
        </dd>
      </div>
    </dl>
  </section>
</template>
