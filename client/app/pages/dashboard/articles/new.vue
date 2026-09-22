<script setup lang="ts">
/**
 * 新建文章。
 * 逻辑全在 ConsoleArticleEditor 里 —— 新建与编辑共用同一个组件，
 * 保存成功后编辑器会把 URL 换成 /dashboard/articles/{id}（router.replace），
 * 用户不会在「新建页」和「编辑页」之间看到内容跳变。
 */
definePageMeta({ layout: 'console', middleware: ['auth'] });
</script>

<template>
  <ConsoleArticleEditor />
</template>
