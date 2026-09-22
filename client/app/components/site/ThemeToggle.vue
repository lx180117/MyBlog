<script setup lang="ts">
/**
 * 主题切换：跟随系统 → 浅色 → 深色 三态循环。
 *
 * 为什么保留「跟随系统」而不是只做浅/深两态：
 * 站长自己用系统级暗色、读者也各有习惯，把系统偏好吞掉会让一部分人觉得
 * 「这站没适配我的设置」。三态是成本最低的正确做法。
 *
 * 必须在 ClientOnly 中使用 —— colorMode 依赖 localStorage，
 * 服务端渲染时拿不到，直接渲染会造成 hydration 不一致。
 */
const colorMode = useColorMode();

const modes = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
] as const;

// preference 在客户端初始化完成前可能是 undefined，此时按「跟随系统」显示
const preference = computed(() => colorMode.preference || 'system');
const current = computed(() => {
  const i = modes.findIndex((m) => m.value === preference.value);
  return i === -1 ? 0 : i;
});
const ready = computed(() => Boolean(colorMode.preference));

function cycle() {
  const next = modes[(current.value + 1) % modes.length];
  if (next) colorMode.preference = next.value;
}
</script>

<template>
  <button
    type="button"
    class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition
           hover:bg-slate-100 hover:text-slate-900
           dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    :title="`主题：${modes[current]?.label}（点击切换）`"
    :aria-label="`切换主题，当前${modes[current]?.label}`"
    @click="cycle"
  >
    <!-- 偏好还没读出来时先给个中性图标，避免闪一下再变 -->
    <svg v-if="!ready" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="12" r="9" />
    </svg>

    <!-- 跟随系统 -->
    <svg v-else-if="preference === 'system'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 20.5h8M12 17.5v3" />
    </svg>

    <!-- 浅色：太阳 -->
    <svg v-else-if="preference === 'light'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>

    <!-- 深色：月亮 -->
    <svg v-else class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  </button>
</template>
