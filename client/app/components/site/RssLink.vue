<script setup lang="ts">
/**
 * RSS 订阅链接。URL 从 apiBase 推导（见 useSettings 的 apiOrigin 注释），
 * 不写死 —— 开发环境指 localhost:3000，生产经 Nginx 反代后与前端同源。
 */
const { rssUrl } = useSettings();
</script>

<template>
  <a
    :href="rssUrl"
    type="application/rss+xml"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-1.5 font-medium text-slate-500 transition
           hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
  >
    <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </svg>
    RSS 订阅
  </a>
</template>
