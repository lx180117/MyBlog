<script setup lang="ts">
import { ARTICLE_STATUS_META, COMMENT_STATUS_META, USER_STATUS_META } from '~/types/domain';
import type { Tone } from '~/types/domain';

/**
 * 状态标签。三种状态枚举共用一张展示表（domain.ts），
 * 避免「文章页显示草稿、列表页显示 draft」这种不一致。
 */
const props = defineProps<{
  status: string;
  kind: 'article' | 'comment' | 'user';
}>();

const MAPS = {
  article: ARTICLE_STATUS_META,
  comment: COMMENT_STATUS_META,
  user: USER_STATUS_META,
};

const meta = computed<{ label: string; tone: Tone }>(() => {
  const map = MAPS[props.kind] as Record<string, { label: string; tone: Tone } | undefined>;
  // 遇到未知状态不要让页面崩：原样显示，标成灰色
  return map[props.status] ?? { label: props.status, tone: 'info' };
});
</script>

<template>
  <el-tag :type="meta.tone" size="small" effect="light" round>{{ meta.label }}</el-tag>
</template>
