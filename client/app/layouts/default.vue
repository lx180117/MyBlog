<script setup lang="ts">
/**
 * 前台默认布局：顶栏 + 内容 + 页脚。
 *
 * 顶栏和页脚各自负责自己的数据加载（站点配置在 useState 里共享，
 * 只有第一次会真正发请求），所以布局本身不需要 await 任何东西 ——
 * 布局阻塞会拖慢整站每一次导航。
 */
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SiteAppHeader />

    <main class="flex-1">
      <slot />
    </main>

    <SiteAppFooter />
  </div>
</template>
