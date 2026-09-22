<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import type { Tone } from '~/types/domain';

/**
 * 后台的单个指标卡。
 *
 * tone 只用于**数字**着色，不给整卡上色 —— 一排五六个彩色卡片会让人
 * 分不清哪个需要关注。只有真正代表「待办」的指标（待审核）才用 amber/rose。
 */
/** 站点主色（indigo）在 Element Plus 的色板里叫 primary，这里单独给个名字更好读 */
type TileTone = Tone | 'brand';

const props = withDefaults(
  defineProps<{
    label: string;
    value: number | string;
    hint?: string;
    tone?: TileTone;
    /** 填了就整卡可点，跳到该指标的列表页（支持带 query） */
    to?: RouteLocationRaw;
  }>(),
  { tone: 'brand' },
);

const TONE_CLASS: Record<TileTone, string> = {
  brand: 'text-brand-600 dark:text-brand-400',
  primary: 'text-brand-600 dark:text-brand-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
  info: 'text-slate-700 dark:text-slate-200',
};

const toneClass = computed(() => TONE_CLASS[props.tone]);
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="card card-hover block p-4">
    <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ label }}</p>
    <p class="mt-1.5 text-2xl font-semibold tabular-nums" :class="toneClass">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-xs text-slate-400 dark:text-slate-500">{{ hint }}</p>
  </NuxtLink>

  <div v-else class="card p-4">
    <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ label }}</p>
    <p class="mt-1.5 text-2xl font-semibold tabular-nums" :class="toneClass">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-xs text-slate-400 dark:text-slate-500">{{ hint }}</p>
  </div>
</template>
