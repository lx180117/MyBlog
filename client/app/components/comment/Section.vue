<script setup lang="ts">
import type { CommentDto, CreateCommentDto, CreateCommentResultDto } from '~/types/api';
import type { Paginated } from '~/types/pagination';

/**
 * 文章评论区。
 *
 * 身份处理（FR-4.1）：登录用户自动带账号昵称，表单不显示昵称/邮箱字段；
 * 未登录访客若站点允许游客评论，则必须填昵称、可填邮箱与个人网站。
 * 邮箱只用于站内通知、后端不会公开返回，这一点要在界面上写清楚 ——
 * 否则没人愿意填。
 */
const props = defineProps<{
  articleId: string;
}>();

const api = useApi();
const auth = useAuth();
const { commentEnabled, commentAllowGuest, commentNeedApprove, perPage } = useSettings();

const page = ref(1);

const { data, status, refresh } = await useAsyncData(
  () => `comments-${props.articleId}-${page.value}`,
  () =>
    api.get<Paginated<CommentDto>>(`/articles/${props.articleId}/comments`, {
      query: { page: page.value, pageSize: Math.min(perPage.value, 20) },
      anonymous: true,
    }),
  { watch: [page] },
);

const comments = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const totalPages = computed(() => data.value?.totalPages ?? 0);

/* ---------------------------------------------------------------- 表单 */

const form = reactive({
  content: '',
  nickname: '',
  email: '',
  website: '',
});

const replyingTo = ref<string | null>(null);
const submitting = ref(false);
const feedback = ref<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

// 登录后把昵称填好，用户不用手打；同时不再显示该输入框
watchEffect(() => {
  const u = auth.state.value.user;
  if (u && !form.nickname) form.nickname = u.nickname;
});

const isLoggedIn = computed(() => auth.isLoggedIn.value);
/** 未登录且站点不允许游客评论 → 只能引导去登录 */
const needLogin = computed(() => !isLoggedIn.value && !commentAllowGuest.value);
const replyTarget = computed(() =>
  replyingTo.value ? comments.value.find((c) => c.id === replyingTo.value) ?? null : null,
);

function startReply(c: CommentDto) {
  replyingTo.value = c.id;
  feedback.value = null;
  nextTick(() => {
    document.getElementById('comment-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function cancelReply() {
  replyingTo.value = null;
}

async function submit() {
  feedback.value = null;

  const content = form.content.trim();
  if (!content) {
    feedback.value = { type: 'err', text: '评论内容不能为空' };
    return;
  }
  if (!isLoggedIn.value && !form.nickname.trim()) {
    feedback.value = { type: 'err', text: '请填写昵称' };
    return;
  }

  submitting.value = true;
  try {
    const body: CreateCommentDto = { content };
    if (replyingTo.value) body.parentId = replyingTo.value;
    // 昵称/邮箱/网站只在游客身份下提交：登录用户的后端逻辑会取账号资料，
    // 传了也会被忽略，不如不传，避免让人误以为改了昵称
    if (!isLoggedIn.value) {
      body.nickname = form.nickname.trim();
      if (form.email.trim()) body.email = form.email.trim();
      if (form.website.trim()) body.website = form.website.trim();
    }

    const res = await api.post<CreateCommentResultDto>(
      `/articles/${props.articleId}/comments`,
      body,
    );

    form.content = '';
    replyingTo.value = null;
    feedback.value = {
      type: res.pendingReview ? 'warn' : 'ok',
      text: res.message,
    };

    // 只有审核通过才会出现在公开列表里，所以仅在这种情况下刷新
    if (!res.pendingReview) await refresh();
  } catch (e) {
    feedback.value = { type: 'err', text: (e as Error).message };
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section id="comments" class="mt-14">
    <div class="flex items-baseline gap-2.5">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">评论</h2>
      <span class="text-sm text-slate-400">{{ total }}</span>
    </div>

    <!-- 评论总开关关闭 -->
    <p
      v-if="!commentEnabled"
      class="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400"
    >
      本站已关闭评论功能。
    </p>

    <template v-else>
      <!-- 评论列表 -->
      <div v-if="status === 'pending'" class="mt-6 space-y-5">
        <div v-for="i in 3" :key="i" class="flex gap-3">
          <div class="skeleton size-[34px] rounded-full" />
          <div class="flex-1 space-y-2">
            <div class="skeleton h-3.5 w-24" />
            <div class="skeleton h-4 w-full" />
            <div class="skeleton h-4 w-2/3" />
          </div>
        </div>
      </div>

      <div v-else-if="!comments.length" class="mt-6">
        <SiteEmptyState
          icon="comment"
          title="还没有评论"
          :description="needLogin ? '登录后就可以参与讨论。' : '来说点什么吧，第一条评论总是最难的。'"
        />
      </div>

      <div v-else class="mt-6 space-y-7">
        <CommentItem
          v-for="c in comments"
          :key="c.id"
          :comment="c"
          :replying-to="replyingTo"
          :can-reply="!needLogin"
          @reply="startReply"
          @cancel-reply="cancelReply"
        />
      </div>

      <div v-if="totalPages > 1" class="mt-8">
        <SitePaginationBar :page="page" :total-pages="totalPages" />
      </div>
    </template>

    <!-- 发表评论 -->
    <div v-if="commentEnabled" id="comment-form" class="mt-10 scroll-mt-28">
      <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {{ replyTarget ? `回复 @${replyTarget.nickname}` : '发表评论' }}
      </h3>

      <div
        v-if="needLogin"
        class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
      >
        本站要求登录后才能评论。
        <NuxtLink to="/login" class="font-medium text-brand-600 hover:underline dark:text-brand-400">
          去登录
        </NuxtLink>
      </div>

      <form v-else class="mt-3 space-y-3" @submit.prevent="submit">
        <ClientOnly>
          <!-- 游客才需要填身份信息 -->
          <div v-if="!isLoggedIn" class="grid gap-3 sm:grid-cols-3">
            <input v-model="form.nickname" class="field" placeholder="昵称 *" maxlength="50" />
            <input v-model="form.email" type="email" class="field" placeholder="邮箱（不公开）" maxlength="100" />
            <input v-model="form.website" class="field" placeholder="个人网站（可选）" maxlength="200" />
          </div>
          <template #fallback>
            <div class="h-[42px]" />
          </template>
        </ClientOnly>

        <textarea
          v-model="form.content"
          rows="4"
          class="field resize-y"
          maxlength="2000"
          :placeholder="replyTarget ? `回复 @${replyTarget.nickname}…` : '写下你的看法…'"
        />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-slate-400">
            <span v-if="commentNeedApprove">评论提交后需要审核通过才会公开显示。</span>
            <span v-else>评论将直接显示。</span>
            <span class="ml-1">{{ form.content.length }}/2000</span>
          </p>

          <div class="flex items-center gap-2">
            <button
              v-if="replyingTo"
              type="button"
              class="btn-ghost btn-sm"
              @click="cancelReply"
            >
              取消回复
            </button>
            <button type="submit" class="btn-primary btn-sm" :disabled="submitting">
              {{ submitting ? '提交中…' : '提交评论' }}
            </button>
          </div>
        </div>

        <p
          v-if="feedback"
          class="rounded-lg px-3 py-2 text-sm"
          :class="{
            'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400': feedback.type === 'ok',
            'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400': feedback.type === 'warn',
            'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400': feedback.type === 'err',
          }"
        >
          {{ feedback.text }}
        </p>
      </form>
    </div>
  </section>
</template>
