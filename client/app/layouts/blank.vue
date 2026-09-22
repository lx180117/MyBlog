<script setup lang="ts">
/**
 * 登录 / 注册 / 错误页用的居中布局。
 */
const { siteName } = useSettings();
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
    <div class="container-page flex h-16 items-center">
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <span class="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          {{ siteName.slice(0, 1) }}
        </span>
        <span class="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{{ siteName }}</span>
      </NuxtLink>
    </div>

    <main class="flex flex-1 items-center justify-center px-4 py-10">
      <div class="w-full max-w-md">
        <slot />
      </div>
    </main>

    <div class="pb-10 text-center text-xs text-slate-400 dark:text-slate-600">
      <NuxtLink to="/" class="transition hover:text-slate-600 dark:hover:text-slate-400">
        ← 返回首页
      </NuxtLink>
    </div>
  </div>
</template>
