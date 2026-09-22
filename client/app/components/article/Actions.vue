<script setup lang="ts">
import type { LikeResultDto } from '~/types/api';
import { formatCount } from '~/utils/format';

/**
 * 文章底部的互动区：点赞 + 分享 + 阅读量。
 *
 * 点赞的「是否已赞」是**按 IP + 文章**在后端去重的（FR-4.6），
 * 前端不存任何本地状态 —— 用 localStorage 记「我赞过」在换浏览器/清缓存后
 * 就会不一致，反而让用户困惑。以服务端返回的 `liked` 为准。
 *
 * 点赞状态依赖请求方的 IP，SSR 渲染时拿到的是「未点赞」，
 * 所以这块整体放在 <ClientOnly> 里，挂载后再向服务端确认真实状态。
 */
const props = defineProps<{
  articleId: string;
  likeCount: number;
  viewCount: number;
  /** SSR 阶段拿到的状态，仅作为初值 */
  initialLiked?: boolean;
}>();

const api = useApi();
const route = useRoute();

const count = ref(props.likeCount);
const liked = ref(Boolean(props.initialLiked));
const busy = ref(false);
const feedback = ref('');
const copied = ref(false);
const canShare = ref(false);

onMounted(() => {
  canShare.value = typeof navigator !== 'undefined' && Boolean(navigator.share);
});

async function toggleLike() {
  if (busy.value) return;
  busy.value = true;
  feedback.value = '';
  try {
    const res = liked.value
      ? await api.del<LikeResultDto>(`/articles/${props.articleId}/like`)
      : await api.post<LikeResultDto>(`/articles/${props.articleId}/like`);

    count.value = res.likeCount;
    liked.value = res.liked;
    // changed=false 说明服务端做了幂等忽略（比如同一 IP 重复点），告知用户实情
    if (!res.changed) feedback.value = '已经点过赞了';
  } catch (e) {
    feedback.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const shareUrl = computed(() =>
  typeof window === 'undefined' ? '' : new URL(route.fullPath, window.location.origin).toString(),
);

async function share() {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: document.title, url: shareUrl.value });
      return;
    } catch {
      // 用户取消分享属于正常操作，不提示
    }
  }
  await copyLink();
}

async function copyLink() {
  try {
    // navigator.clipboard 只在「安全上下文」（HTTPS / localhost）里存在。
    // 内网私有部署常见 http://内网IP 的形态，此时它是 undefined，
    // 直接调用会抛 TypeError —— 所以这里必须先探测再降级。
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl.value);
    } else {
      fallbackCopy(shareUrl.value);
    }
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    feedback.value = '复制失败，请手动复制地址栏链接';
  }
}

/**
 * 非安全上下文（http://）下的复制降级方案。
 *
 * `document.execCommand('copy')` 虽已被标记为废弃，但它是**唯一**能在
 * 非 HTTPS 页面里完成复制的办法（现代剪贴板 API 在那里根本不存在）。
 * 因为只是临时插一个不可见的 textarea，用完立刻移除，对页面没有副作用。
 */
function fallbackCopy(text: string) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-9999px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('execCommand copy returned false');
  } finally {
    document.body.removeChild(area);
  }
}
</script>

<template>
  <div class="mt-10 flex flex-wrap items-center gap-3">
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition
             disabled:opacity-60"
      :class="
        liked
          ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-300'
          : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-brand-700 dark:hover:text-brand-300'
      "
      :disabled="busy"
      :aria-pressed="liked"
      @click="toggleLike"
    >
      <svg class="size-4" viewBox="0 0 24 24" :fill="liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
        <path d="M7 22V11l5-9a2.5 2.5 0 0 1 2.4 3.2L13 11h5.3a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6Z" />
        <path d="M7 11H3v11h4" />
      </svg>
      {{ liked ? '已点赞' : '点赞' }}
      <span class="tabular-nums">{{ formatCount(count) }}</span>
    </button>

    <button
      type="button"
      class="btn-ghost cursor-pointer rounded-full"
      @click="share"
    >
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <path d="M12 16V3M8 7l4-4 4 4" />
      </svg>
      {{ copied ? '已复制链接' : canShare ? '分享' : '复制链接' }}
    </button>

    <span class="ml-auto flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
      {{ formatCount(viewCount) }} 次阅读
    </span>

    <p v-if="feedback" class="w-full text-xs text-slate-400">{{ feedback }}</p>
  </div>
</template>
