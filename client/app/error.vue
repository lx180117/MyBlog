<script setup lang="ts">
/**
 * 全局错误页。
 *
 * 处理两种截然不同的情况，文案必须区分开，否则用户不知道该找谁：
 *  - 404：地址错了 → 给「回首页 / 搜索」的出口
 *  - 500：服务端故障 → 给「重试」，并显示请求 id 之类的线索以便排查
 */
const props = defineProps<{ error: { statusCode: number; statusMessage?: string; message?: string } }>();

const { siteName } = useSettings();

const isNotFound = computed(() => props.error.statusCode === 404);
const isServerError = computed(() => props.error.statusCode >= 500);

const title = computed(() => {
  if (isNotFound.value) return '页面不存在';
  if (isServerError.value) return '服务器出了点问题';
  return '请求无法完成';
});

const description = computed(() => {
  if (isNotFound.value) return '这个地址下没有内容 —— 可能链接写错了，或者文章已被作者删除。';
  if (isServerError.value) return '服务端处理这个请求时出错了。稍后重试一次，如果一直这样，请联系站长。';
  return props.error.statusMessage || props.error.message || '请稍后重试。';
});

useHead({ title: `${title.value} · ${siteName.value}` });
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
    <p class="font-mono text-6xl font-bold text-slate-200 dark:text-slate-800">
      {{ error.statusCode }}
    </p>

    <h1 class="mt-5 text-xl font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h1>
    <p class="mt-2 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
      {{ description }}
    </p>

    <div class="mt-8 flex items-center gap-3">
      <button type="button" class="btn-primary" @click="$router.back()">返回上一页</button>
      <NuxtLink to="/" class="btn-ghost">回到首页</NuxtLink>
    </div>

    <NuxtLink
      to="/search"
      class="mt-6 text-sm text-slate-400 transition hover:text-brand-600 dark:hover:text-brand-400"
    >
      或者去搜索文章
    </NuxtLink>
  </div>
</template>
