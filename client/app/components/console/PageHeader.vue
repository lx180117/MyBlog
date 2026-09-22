<script setup lang="ts">
/** 后台内页统一的标题区：左标题右操作。 */
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h2>
      <p v-if="description" class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {{ description }}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
