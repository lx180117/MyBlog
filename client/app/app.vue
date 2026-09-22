<script setup lang="ts">
/**
 * 应用根组件。
 *
 * 站点的 title 模板、默认 meta、站点图标都依赖后台配置（GET /settings），
 * 所以在这里统一用 useSettings() 拉一次 —— SSR 首屏就能带上正确的 <title>，
 * 爬虫看到的是完整信息，而不是「我的博客」这种占位默认值。
 */
const { siteName, siteDescription, settings, load } = useSettings();

// SSR 时先取配置，再渲染页面
await useAsyncData('site-settings', async () => {
  await load();
  return true;
});

useHead({
  // 页面标题里如果已经带了站点名就不再拼一次：首页的标题是「站点名 · 副标题」，
  // 无脑拼会出现「我的博客 · 我的博客」这种重复标题（连真库跑 SSR 时实测到的）
  titleTemplate: (title?: string) =>
    !title ? siteName.value : title.includes(siteName.value) ? title : `${title} · ${siteName.value}`,
  meta: [
    { name: 'description', content: () => siteDescription.value },
    { property: 'og:site_name', content: () => siteName.value },
    { property: 'og:type', content: 'website' },
  ],
  link: [
    {
      rel: 'icon',
      href: () => settings.value?.siteFavicon || '/favicon.svg',
    },
  ],
});
</script>

<template>
  <div>
    <NuxtLoadingIndicator color="#6366f1" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
