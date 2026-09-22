<script setup lang="ts">
import type { CommentStatsDto } from '~/types/api';

definePageMeta({ layout: 'console', middleware: ['auth'] });

const api = useApi();
const route = useRoute();
const stats = ref<CommentStatsDto | null>(null);

/**
 * 状态筛选以 **URL query 为准**（`?status=pending`）。
 * 好处有两个：仪表盘的「待审核」卡片可以直接链过来；刷新页面不会丢筛选条件。
 * 组件内部的切换（点「通过 / 拒绝」标签）也会写回 URL，两边保持一致。
 */
const status = computed(() => String(route.query.status ?? ''));

async function loadStats() {
  try {
    // 作者也能调这个接口：服务层会把范围限制到「自己文章下的评论」
    stats.value = await api.get<CommentStatsDto>('/admin/comments/stats');
  } catch {
    /* 统计失败不影响审核列表 */
  }
}

function syncUrl(value: string) {
  // replace 而不是 push：连点几个标签不该在浏览器历史里堆一串记录，
  // 否则用户按「后退」要在筛选条件之间来回弹
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
      title="评论管理"
      description="只显示你自己文章下的评论。通过后立即出现在前台，拒绝的会保留在库里、随时可以改回来。"
    />

    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ConsoleStatTile
        label="待审核"
        :value="stats ? stats.pending : '—'"
        tone="warning"
        :to="{ path: '/dashboard/comments', query: { status: 'pending' } }"
        hint="需要处理"
      />
      <ConsoleStatTile
        label="已通过"
        :value="stats ? stats.approved : '—'"
        tone="success"
        :to="{ path: '/dashboard/comments', query: { status: 'approved' } }"
      />
      <ConsoleStatTile
        label="已拒绝"
        :value="stats ? stats.rejected : '—'"
        tone="danger"
        :to="{ path: '/dashboard/comments', query: { status: 'rejected' } }"
      />
      <ConsoleStatTile label="今日新增" :value="stats ? stats.today : '—'" />
    </div>

    <div class="card p-4">
      <ConsoleCommentModeration
        scope="me"
        :initial-status="status"
        @changed="loadStats"
        @status-change="syncUrl"
      />
    </div>
  </div>
</template>
