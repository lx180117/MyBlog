<script setup lang="ts">
import type { CommentAdminViewDto, BatchModerateResultDto, OperationResultDto } from '~/types/api';
import type { Paginated } from '~/types/pagination';
import { confirmDanger, errorText, notifyError, notifyOk } from '~/utils/dialog';

/**
 * 评论审核台。作者工作台看「自己文章下的评论」，管理员看全站。
 *
 * 一个不直观但很重要的契约细节：
 *   列表接口是分开的（作者用 /me/comments，管理员用 /admin/comments），
 *   但**审核动作全在 /admin/comments/* 下** —— 后端把这几个接口的角色
 *   放宽到了 `admin, author`，并在服务层用 `assertCanManage` 逐条校验归属
 *   （作者的越权请求会拿到 403）。所以前端不按角色切换审核接口，
 *   靠后端兜底，避免前端漏判导致越权。
 */
const props = withDefaults(
  defineProps<{
    /** me = 我的文章下的评论；admin = 全站 */
    scope?: 'me' | 'admin';
    /** 每页条数 */
    pageSize?: number;
    /** 初始筛选状态（'' = 全部）。从仪表盘的「待审核」卡片点进来时用 */
    initialStatus?: string;
  }>(),
  { scope: 'me', pageSize: 20, initialStatus: '' },
);

/**
 * `changed`：审核动作发生后通知父级刷新统计。
 * `status-change`：内部切换筛选标签时冒泡出去，由页面写回 URL ——
 * 这样「URL 是筛选条件的唯一来源」这条规则在两个方向上都是通的。
 */
const emit = defineEmits<{ changed: []; 'status-change': [string] }>();

const api = useApi();

const listEndpoint = computed(() =>
  props.scope === 'admin' ? '/admin/comments' : '/me/comments',
);
const showPrivate = computed(() => props.scope === 'admin');

const busyId = ref('');
const selected = ref<CommentAdminViewDto[]>([]);

const { page, pageSize, filters, items, total, loading, error, load, reload, goPage, resizePage, reloadAfterRemove } =
  usePagedList<CommentAdminViewDto, { status: string; keyword: string }>(
    (q) =>
      api.get<Paginated<CommentAdminViewDto>>(listEndpoint.value, {
        query: {
          page: q.page,
          pageSize: q.pageSize,
          status: q.status,
          keyword: q.keyword.trim(),
        },
      }),
    { status: props.initialStatus, keyword: '' },
    { pageSize: props.pageSize },
  );
const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
];

onMounted(() => {
  void load();
});

/**
 * 从仪表盘的卡片点进来时会带上 ?status=pending。
 * 同一个路由只是 query 变了，组件不会重建，所以要显式监听并重新查询。
 */
watch(
  () => props.initialStatus,
  (value) => {
    filters.status = value;
    void reload();
  },
);

function onSelectionChange(rows: CommentAdminViewDto[]) {
  selected.value = rows;
}

/** 切换状态标签：先冒泡给父级（写回 URL），再自己重查 */
function onStatusTabChange(value: string | number | boolean | undefined) {
  emit('status-change', String(value ?? ''));
  void reload();
}

/* ------------------------------------------------------------ 单条审核 */

/**
 * 表格插槽给的 row 是无类型数据（EP 声明为 Record<PropertyKey, any>），
 * 传不进强类型的函数，所以这几个入口统一用 unknown 收窄。
 *
 * 审核对象用**结构类型**而不是整个 DTO：顶级评论是 CommentAdminViewDto、
 * 回复是 CommentDto，两者只共用到 id 和 status。
 */
interface ModerateTarget {
  id: string;
  status: string;
}

function asTarget(raw: unknown): ModerateTarget {
  return raw as ModerateTarget;
}

function asComment(raw: unknown): CommentAdminViewDto {
  return raw as CommentAdminViewDto;
}

/**
 * 单条审核：就地改状态而不是整表重载。
 * 审核是连续动作（一次过十几条），每点一次都重载会让滚动位置跳回顶部。
 * items 是 ref([])（深响应），改嵌套属性模板会跟着更新。
 */
async function moderate(raw: unknown, action: 'approve' | 'reject') {
  const row = asTarget(raw);
  busyId.value = row.id;
  try {
    const res = await api.patch<OperationResultDto>(`/admin/comments/${row.id}/${action}`);
    row.status = action === 'approve' ? 'approved' : 'rejected';
    notifyOk(res?.message ?? '操作成功');
    emit('changed');
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}

async function removeComment(raw: unknown) {
  const row = asComment(raw);
  const ok = await confirmDanger(
    row.replies.length
      ? `这条评论下还有 ${row.replies.length} 条回复，会一并删除。`
      : '删除后不可恢复。',
    { title: '删除评论', confirmText: '删除' },
  );
  if (!ok) return;

  busyId.value = row.id;
  try {
    const res = await api.del<OperationResultDto>(`/admin/comments/${row.id}`);
    notifyOk(res?.message ?? '评论已删除');
    await reloadAfterRemove(1);
    emit('changed');
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}

/* ------------------------------------------------------------ 批量 */

const BATCH_ACTIONS = [
  { action: 'approve', label: '批量通过', type: 'success' },
  { action: 'reject', label: '批量拒绝', type: 'warning' },
  { action: 'delete', label: '批量删除', type: 'danger' },
] as const;

async function batch(action: 'approve' | 'reject' | 'delete') {
  if (!selected.value.length) return;

  // 后端限制单次 100 条。提前拦一下，比让用户等到 400 再猜原因好
  if (selected.value.length > 100) {
    notifyError('单次最多处理 100 条，请分批操作');
    return;
  }

  if (action === 'delete') {
    const ok = await confirmDanger(`将永久删除选中的 ${selected.value.length} 条评论及其回复。`, {
      title: '批量删除',
      confirmText: '全部删除',
    });
    if (!ok) return;
  }

  busyId.value = 'batch';
  try {
    const res = await api.post<BatchModerateResultDto>('/admin/comments/batch', {
      ids: selected.value.map((c) => c.id),
      action,
    });
    notifyOk(res?.message ?? '批量操作完成');
    selected.value = [];
    await load();
    emit('changed');
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}

/** 回复也要能单独处理：它们同样是 pending 状态的评论 */
function canAct(status: string, action: 'approve' | 'reject') {
  return action === 'approve' ? status !== 'approved' : status !== 'rejected';
}

/** 待审核的行加底色，一眼能扫出来该处理哪些（样式见 main.css 的 .is-pending） */
function rowClassName({ row }: { row: CommentAdminViewDto }): string {
  return row.status === 'pending' ? 'is-pending' : '';
}
</script>

<template>
  <div>
    <!-- 筛选 + 批量工具条 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <el-radio-group v-model="filters.status" @change="onStatusTabChange">
        <el-radio-button v-for="tab in STATUS_TABS" :key="tab.value" :value="tab.value">
          {{ tab.label }}
        </el-radio-button>
      </el-radio-group>

      <el-input
        v-model="filters.keyword"
        placeholder="搜索评论内容 / 昵称"
        clearable
        class="max-w-64"
        @keyup.enter="reload()"
        @clear="reload()"
      >
        <template #append>
          <el-button @click="reload()">搜索</el-button>
        </template>
      </el-input>

      <div class="ml-auto flex items-center gap-3">
        <span v-if="selected.length" class="text-xs text-slate-500 dark:text-slate-400">
          已选 {{ selected.length }} 条
        </span>
        <template v-if="selected.length">
          <el-button
            v-for="item in BATCH_ACTIONS"
            :key="item.action"
            :type="item.type"
            size="small"
            :loading="busyId === 'batch'"
            @click="batch(item.action)"
          >
            {{ item.label }}
          </el-button>
        </template>
        <span v-else class="text-xs text-slate-400 dark:text-slate-500">共 {{ total }} 条</span>
      </div>
    </div>

    <el-alert v-if="error" type="error" show-icon :closable="false" class="mb-4" :title="error" />

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
      class="w-full"
      :row-class-name="rowClassName"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="42" />

      <el-table-column label="评论" min-width="340">
        <template #default="{ row }">
          <div>
            <!-- 正文按原样展示并保留换行；不渲染 Markdown —— 评论是纯文本 -->
            <p class="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-200">
              {{ row.content }}
            </p>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400 dark:text-slate-500">
              <span>来自</span>
              <NuxtLink
                :to="`/articles/${row.articleSlug}`"
                target="_blank"
                class="text-brand-600 hover:underline dark:text-brand-400"
              >
                {{ row.articleTitle }}
              </NuxtLink>
            </div>

            <!-- 回复：两级结构，展开显示，方便一条条过审 -->
            <div
              v-if="row.replies.length"
              class="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3 dark:border-slate-800"
            >
              <div v-for="reply in row.replies" :key="reply.id" class="text-xs">
                <div class="flex items-start gap-2">
                  <span class="shrink-0 text-slate-400 dark:text-slate-500">↳ {{ reply.nickname }}</span>
                  <span class="min-w-0 flex-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                    {{ reply.content }}
                  </span>
                  <ConsoleStatusTag :status="reply.status" kind="comment" />
                </div>
                <div class="mt-0.5 flex items-center gap-2 pl-4">
                  <el-button
                    v-if="canAct(reply.status, 'approve')"
                    link
                    type="success"
                    size="small"
                    :loading="busyId === reply.id"
                    @click="moderate(reply, 'approve')"
                  >
                    通过
                  </el-button>
                  <el-button
                    v-if="canAct(reply.status, 'reject')"
                    link
                    type="warning"
                    size="small"
                    :loading="busyId === reply.id"
                    @click="moderate(reply, 'reject')"
                  >
                    拒绝
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="评论人" width="150">
        <template #default="{ row }">
          <div class="flex flex-col gap-0.5">
            <span class="truncate text-sm text-slate-700 dark:text-slate-200">{{ row.nickname }}</span>
            <div class="flex flex-wrap gap-1">
              <span
                v-if="row.isArticleAuthor"
                class="rounded bg-brand-100 px-1 text-[10px] font-medium text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
              >
                作者
              </span>
              <span v-else-if="!row.isRegistered" class="text-[10px] text-slate-400 dark:text-slate-500">
                游客
              </span>
              <span v-else class="text-[10px] text-slate-400 dark:text-slate-500">注册用户</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="96">
        <template #default="{ row }">
          <ConsoleStatusTag :status="row.status" kind="comment" />
        </template>
      </el-table-column>

      <el-table-column v-if="showPrivate" label="来源" width="170">
        <template #default="{ row }">
          <div class="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <div class="truncate" :title="row.email ?? ''">{{ row.email || '—' }}</div>
            <div class="truncate" :title="row.userAgent ?? ''">{{ row.ipAddress || '—' }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="时间" width="140">
        <template #default="{ row }">
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {{ formatDateTime(row.createdAt) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <div class="flex flex-wrap items-center gap-x-2">
            <el-button
              v-if="canAct(row.status, 'approve')"
              link
              type="success"
              size="small"
              :loading="busyId === row.id"
              @click="moderate(row, 'approve')"
            >
              通过
            </el-button>
            <el-button
              v-if="canAct(row.status, 'reject')"
              link
              type="warning"
              size="small"
              :loading="busyId === row.id"
              @click="moderate(row, 'reject')"
            >
              拒绝
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              :loading="busyId === row.id"
              @click="removeComment(row)"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <div class="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {{ filters.status === 'pending' ? '没有待审核的评论，很干净' : '没有评论' }}
        </div>
      </template>
    </el-table>

    <div v-if="total > 0" class="mt-4 flex justify-end">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="goPage"
        @size-change="resizePage"
      />
    </div>
  </div>
</template>
