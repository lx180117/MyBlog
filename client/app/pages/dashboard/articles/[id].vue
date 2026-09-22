<script setup lang="ts">
/**
 * 编辑文章。
 *
 * 必须给 `key`：从「编辑 A」跳到「编辑 B」时是**同一个路由、只换了参数**，
 * Nuxt 默认会复用页面组件实例，编辑器里加载的还是 A 的内容，
 * 而地址栏已经变成 B 了 —— 一旦顺手保存就会把 B 覆盖成 A 的正文。
 * 这个 bug 只在「在编辑器之间跳转」时出现，直接刷新页面是好的，很难查。
 */
definePageMeta({
  layout: 'console',
  middleware: ['auth'],
  key: (route) => `article-edit-${String(route.params.id)}`,
});

const route = useRoute();
const articleId = computed(() => String(route.params.id));
</script>

<template>
  <ConsoleArticleEditor :article-id="articleId" />
</template>
