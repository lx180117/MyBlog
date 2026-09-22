<script setup lang="ts">
import type { CommentStatsDto } from '~/types/api';

definePageMeta({ layout: 'console', middleware: ['admin'] });

const api = useApi();
const route = useRoute();
const stats = ref<CommentStatsDto | null>(null);

/** 与作者工作台的评论页同一套约定：筛选状态以 URL 为准 */
const status = computed(() => String(route.query.status ?? ''));

async function loadStats() {
  try {
    stats.value = await api.get<CommentStatsDto>('/admin/comments/stats');
  } catch {
    /* 统计失败不影响审核列表 */
  }
}

function syncUrl(value: string) {
  void navigateTo(
    { path: route.path, query: value ? { status: value } : {} },
    { replace: true },
  );
}

onMounted(loadStats);
</script>

<template>
  <div>
    <ConsolePageHeader
      title="评论审核"
      description="全站评论。待审核的行有黄色底色，可以单条处理，也可以勾选后批量处理（单次最多 100 条）。"
    />

    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ConsoleStatTile
        label="待审核"
        :value="stats ? stats.pending : '—'"
        tone="warning"
        hint="需要处理"
        :to="{ path: '/admin/comments', query: { status: 'pending' } }"
      />
      <ConsoleStatTile
        label="已通过"
        :value="stats ? stats.approved : '—'"
        tone="success"
        :to="{ path: '/admin/comments', query: { status: 'approved' } }"
      />
      <ConsoleStatTile
        label="已拒绝"
        :value="stats ? stats.rejected : '—'"
        tone="danger"
        :to="{ path: '/admin/comments', query: { status: 'rejected' } }"
      />
      <ConsoleStatTile label="今日新增" :value="stats ? stats.today : '—'" />
    </div>

    <div class="card p-4">
      <ConsoleCommentModeration
        scope="admin"
        :initial-status="status"
        @changed="loadStats"
        @status-change="syncUrl"
      />
    </div>
  </div>
</template>
