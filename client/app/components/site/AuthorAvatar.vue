<script setup lang="ts">
import { hueOf, initialOf } from '~/utils/format';

/**
 * 头像。没有上传头像时退化为「首字 + 由用户名派生的固定色相」的字母头像。
 *
 * 为什么不用第三方默认头像（如 gravatar）：那要往外部发请求，
 * 自托管博客不该因为一个头像把读者 IP 暴露给第三方。
 */
const props = withDefaults(
  defineProps<{
    src?: string | null;
    name?: string | null;
    /** 派生颜色用的种子，默认取 name；用 username 更稳定（改昵称不会换色） */
    seed?: string | null;
    size?: number;
    /** 是否带一圈描边，用在文章作者位这种背景复杂的地方 */
    ring?: boolean;
  }>(),
  { size: 36, ring: false },
);

const hue = computed(() => hueOf(props.seed ?? props.name ?? ''));
const initial = computed(() => initialOf(props.name));

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.42)}px`,
}));

const letterStyle = computed(() => ({
  background: `hsl(${hue.value} 62% 92%)`,
  color: `hsl(${hue.value} 52% 32%)`,
}));
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name ?? '头像'"
    :style="style"
    class="shrink-0 rounded-full object-cover"
    :class="ring ? 'ring-2 ring-white dark:ring-slate-900' : ''"
    loading="lazy"
  />
  <span
    v-else
    :style="{ ...style, ...letterStyle }"
    class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none"
    :class="ring ? 'ring-2 ring-white dark:ring-slate-900' : ''"
    :aria-label="name ?? '头像'"
    role="img"
  >
    {{ initial }}
  </span>
</template>
