<script setup lang="ts">
import type { CommentDto } from '~/types/api';
import { formatRelative } from '~/utils/format';

/**
 * 单条评论（含其回复）。
 *
 * 两级结构的处理要点（FR-4.2）：
 *  - 顶级评论把 `replies` 平铺在下方；
 *  - 回复**不再递归**渲染自己的 replies（后端保证回复本身没有回复，
 *    数据库触发器会拦住「回复的回复」），所以这里只需要一层 v-for。
 *    写成递归组件会让人误以为可以无限嵌套。
 */
const props = defineProps<{
  comment: CommentDto;
  /** 正在回复的目标 id */
  replyingTo?: string | null;
  /** 评论功能是否开启；回复按钮的显隐由它控制 */
  canReply?: boolean;
}>();

const emit = defineEmits<{ reply: [comment: CommentDto]; cancelReply: [] }>();

const isReplying = computed(() => props.replyingTo === props.comment.id);

/**
 * 相对时间在 SSR 与客户端会算出不同结果（「3 分钟前」vs「4 分钟前」），
 * 直接渲染会造成 hydration 不一致。所以服务端先渲染**绝对日期**，
 * 挂载后再换成相对时间。
 */
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const timeText = computed(() =>
  mounted.value ? formatRelative(props.comment.createdAt) : new Date(props.comment.createdAt).toISOString().slice(0, 10),
);
</script>

<template>
  <div class="flex gap-3">
    <SiteAuthorAvatar
      :src="comment.avatarUrl"
      :name="comment.nickname"
      :size="34"
      class="mt-0.5"
    />

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          v-if="comment.website"
          :href="comment.website"
          target="_blank"
          rel="noopener noreferrer nofollow"
          class="text-sm font-medium text-slate-800 transition hover:text-brand-600 dark:text-slate-200 dark:hover:text-brand-400"
        >
          {{ comment.nickname }}
        </a>
        <span v-else class="text-sm font-medium text-slate-800 dark:text-slate-200">
          {{ comment.nickname }}
        </span>

        <!-- 作者标识：读者最想先看作者怎么回应的 -->
        <span
          v-if="comment.isArticleAuthor"
          class="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
        >
          作者
        </span>
        <span
          v-else-if="comment.isRegistered"
          class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          注册用户
        </span>

        <time
          :datetime="comment.createdAt"
          :title="new Date(comment.createdAt).toLocaleString('zh-CN')"
          class="text-xs text-slate-400 dark:text-slate-500"
        >
          {{ timeText }}
        </time>

        <!-- 待审核的评论对自己可见（否则用户会以为没发出去又发一遍） -->
        <span
          v-if="comment.status !== 'approved'"
          class="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
        >
          {{ comment.status === 'pending' ? '待审核' : '未通过' }}
        </span>
      </div>

      <p class="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300">
        {{ comment.content }}
      </p>

      <div v-if="canReply" class="mt-2">
        <button
          v-if="!isReplying"
          type="button"
          class="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-brand-600 dark:hover:text-brand-400"
          @click="emit('reply', comment)"
        >
          回复
        </button>
        <button
          v-else
          type="button"
          class="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-slate-600"
          @click="emit('cancelReply')"
        >
          取消回复
        </button>
      </div>

      <!-- 回复列表：只渲染一层，不做递归（后端保证不会有第三层） -->
      <div
        v-if="comment.replies?.length"
        class="mt-4 space-y-4 border-l-2 border-slate-100 pl-4 dark:border-slate-800"
      >
        <CommentItem
          v-for="reply in comment.replies"
          :key="reply.id"
          :comment="reply"
          :can-reply="false"
        />
      </div>
    </div>
  </div>
</template>
