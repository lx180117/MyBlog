<script setup lang="ts">
/** 空状态占位。列表页、搜索结果为空时统一用它，避免各页各写一套。 */
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    /** 顶部图标的名字（内置了几种常用的，见下方 svg 分支） */
    icon?: 'document' | 'search' | 'comment' | 'inbox';
  }>(),
  { title: '这里还没有内容', icon: 'inbox' },
);
</script>

<template>
  <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-16 text-center dark:border-slate-800">
    <div class="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
      <svg v-if="icon === 'search'" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <svg v-else-if="icon === 'comment'" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
        <path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" />
      </svg>
      <svg v-else-if="icon === 'document'" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5" />
      </svg>
      <svg v-else class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
        <path d="M3 8.5 12 3l9 5.5v9L12 23l-9-5.5Z" />
        <path d="M3 8.5 12 14l9-5.5M12 14v9" />
      </svg>
    </div>

    <p class="mt-4 text-sm font-medium text-slate-700 dark:text-slate-300">{{ title }}</p>
    <p v-if="description" class="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
      {{ description }}
    </p>

    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>
