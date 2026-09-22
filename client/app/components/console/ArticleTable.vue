<script setup lang="ts">
import type { ArticleManageDto } from '~/types/api';
import type { Paginated } from '~/types/pagination';
import { confirmDanger, errorText, notifyError, notifyOk } from '~/utils/dialog';

/**
 * 文章管理表格：作者工作台（/me/articles）与管理员的「全部文章」（/admin/articles）共用。
 *
 * 两个端点的**响应结构完全相同**（都是 ArticleManageDto 分页），差别只有：
 *   - 管理端能多看到「作者」列
 *   - 管理端多一个「彻底删除」（DELETE /admin/articles/:id/purge）
 * 所以用一个组件 + 两个开关，而不是复制一份再各自演化。
 */
const props = withDefaults(
  defineProps<{
    /** '/me/articles' 或 '/admin/articles' */
    endpoint: string;
    showAuthor?: boolean;
    /** 是否显示「彻底删除」（仅管理员） */
    purgeable?: boolean;
  }>(),
  { showAuthor: false, purgeable: false },
);

const emit = defineEmits<{ changed: [] }>();

const api = useApi();

/** 正在进行行内操作的记录 ID，用来禁用该行按钮、避免重复提交 */
const busyId = ref('');

// 解构出来用：这些 ref 提到顶层之后模板里会自动解包，
// 否则「list.total」在模板里拿到的是 ref 对象本身而不是数字
const { page, pageSize, filters, items, total, loading, error, load, reload, goPage, resizePage, reloadAfterRemove } =
  usePagedList<ArticleManageDto, { status: string; keyword: string }>(
    (q) =>
      api.get<Paginated<ArticleManageDto>>(props.endpoint, {
        query: {
          page: q.page,
          pageSize: q.pageSize,
          // 空串会被 api 层丢掉，等于不传该筛选条件
          status: q.status,
          keyword: q.keyword.trim(),
        },
      }),
    { status: '', keyword: '' },
  );

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'deleted', label: '回收站' },
];

onMounted(() => {
  void load();
});

/**
 * Element Plus 的表格插槽把 row 声明成 `Record<PropertyKey, any>`，
 * 传不进强类型的函数。这里统一用 `unknown` 接收、在函数体开头收窄一次 ——
 * 相比在每个调用点写 `row as ArticleManageDto`，噪音小得多，
 * 而且「表格给我们的是无类型数据」这件事只在一个地方声明。
 */
function asRow(raw: unknown): ArticleManageDto {
  return raw as ArticleManageDto;
}

/** 是否处于定时发布中（发布时间在未来） */
function isScheduled(raw: unknown): boolean {
  const row = asRow(raw);
  if (row.status !== 'published' || !row.publishedAt) return false;
  return new Date(row.publishedAt).getTime() > Date.now();
}

/** 统一的「请求 → 提示 → 刷新」流程 */
async function mutate(
  row: ArticleManageDto,
  run: () => Promise<unknown>,
  fallbackMessage: string,
  removed = false,
) {
  busyId.value = row.id;
  try {
    const res = (await run()) as { message?: string } | null;
    notifyOk(res?.message ?? fallbackMessage);
    if (removed) await reloadAfterRemove(1);
    else await load();
    emit('changed');
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}

function edit(raw: unknown) {
  return navigateTo(`/dashboard/articles/${asRow(raw).id}`);
}

const publish = (raw: unknown) => {
  const row = asRow(raw);
  return mutate(row, () => api.patch(`/me/articles/${row.id}/publish`, {}), '文章已发布');
};

const unpublish = (raw: unknown) => {
  const row = asRow(raw);
  return mutate(row, () => api.patch(`/me/articles/${row.id}/unpublish`), '已撤回为草稿');
};

const toggleTop = (raw: unknown) => {
  const row = asRow(raw);
  return mutate(
    row,
    () => api.patch(`/me/articles/${row.id}/top`, { isTop: !row.isTop }),
    row.isTop ? '已取消置顶' : '已置顶',
  );
};

const restore = (raw: unknown) => {
  const row = asRow(raw);
  return mutate(row, () => api.post(`/me/articles/${row.id}/restore`), '已恢复到草稿');
};

async function remove(raw: unknown) {
  const row = asRow(raw);
  const ok = await confirmDanger(`「${row.title}」会移入回收站，之后可以随时恢复。`, {
    title: '移入回收站',
    confirmText: '移入回收站',
  });
  if (!ok) return;
  // 软删除后这条就不再属于当前筛选结果（除非正在看回收站），按「少一条」刷新
  await mutate(row, () => api.del(`/me/articles/${row.id}`), '已移入回收站', true);
}

async function purge(raw: unknown) {
  const row = asRow(raw);
  const ok = await confirmDanger(
    `「${row.title}」将被彻底删除，它的评论、点赞、阅读记录会一并清除，无法恢复。`,
    { title: '彻底删除', confirmText: '彻底删除' },
  );
  if (!ok) return;
  await mutate(row, () => api.del(`/admin/articles/${row.id}/purge`), '已彻底删除', true);
}
</script>

<template>
  <div>
    <!-- 筛选条 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <el-radio-group v-model="filters.status" @change="reload()">
        <el-radio-button v-for="tab in STATUS_TABS" :key="tab.value" :value="tab.value">
          {{ tab.label }}
        </el-radio-button>
      </el-radio-group>

      <el-input
        v-model="filters.keyword"
        placeholder="搜索标题"
        clearable
        class="max-w-64"
        @keyup.enter="reload()"
        @clear="reload()"
      >
        <template #append>
          <el-button @click="reload()">搜索</el-button>
        </template>
      </el-input>

      <span class="ml-auto text-xs text-slate-400 dark:text-slate-500">共 {{ total }} 篇</span>
    </div>

    <el-alert v-if="error" type="error" show-icon :closable="false" class="mb-4" :title="error" />

    <el-table v-loading="loading" :data="items" row-key="id" class="w-full">
      <el-table-column label="标题" min-width="260">
        <template #default="{ row }">
          <div class="min-w-0">
            <NuxtLink
              :to="`/dashboard/articles/${row.id}`"
              class="flex items-center gap-1.5 font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
            >
              <span
                v-if="row.isTop"
                class="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
              >
                置顶
              </span>
              <span class="truncate">{{ row.title }}</span>
            </NuxtLink>
            <div
              class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400 dark:text-slate-500"
            >
              <span class="truncate">/{{ row.slug }}</span>
              <span v-if="row.categoryName">· {{ row.categoryName }}</span>
              <span v-for="tag in row.tags.slice(0, 3)" :key="tag">· {{ tag }}</span>
              <span v-if="row.tags.length > 3">· +{{ row.tags.length - 3 }}</span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <ConsoleStatusTag :status="row.status" kind="article" />
        </template>
      </el-table-column>

      <el-table-column v-if="showAuthor" label="作者" width="120">
        <template #default="{ row }">
          <span class="text-sm text-slate-600 dark:text-slate-300">{{ row.authorNickname }}</span>
        </template>
      </el-table-column>

      <el-table-column label="数据" width="140">
        <template #default="{ row }">
          <div class="flex gap-3 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span>{{ formatCount(row.viewCount) }} 阅</span>
            <span>{{ row.likeCount }} 赞</span>
            <span>{{ row.commentCount }} 评</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="时间" width="160">
        <template #default="{ row }">
          <div class="text-xs text-slate-500 dark:text-slate-400">
            <template v-if="row.status === 'deleted'">
              <div class="text-rose-500">
                删除 {{ formatDate(row.deletedAt ?? row.updatedAt) }}
              </div>
            </template>
            <template v-else-if="row.status === 'published' && row.publishedAt">
              <div>发布 {{ formatDateTime(row.publishedAt) }}</div>
              <div v-if="isScheduled(row)" class="mt-0.5 text-amber-600 dark:text-amber-400">
                定时中
              </div>
              <div v-else class="mt-0.5 text-slate-400 dark:text-slate-500">
                更新 {{ formatDate(row.updatedAt) }}
              </div>
            </template>
            <template v-else>
              <div>更新 {{ formatDateTime(row.updatedAt) }}</div>
            </template>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <template v-if="row.status === 'deleted'">
              <el-button
                link
                type="primary"
                size="small"
                :loading="busyId === row.id"
                @click="restore(row)"
              >
                恢复
              </el-button>
              <el-button
                v-if="purgeable"
                link
                type="danger"
                size="small"
                :loading="busyId === row.id"
                @click="purge(row)"
              >
                彻底删除
              </el-button>
            </template>

            <template v-else>
              <el-button link type="primary" size="small" @click="edit(row)">编辑</el-button>
              <el-button
                v-if="row.status === 'draft'"
                link
                type="success"
                size="small"
                :loading="busyId === row.id"
                @click="publish(row)"
              >
                发布
              </el-button>
              <el-button v-else link size="small" :loading="busyId === row.id" @click="unpublish(row)">
                撤回
              </el-button>
              <el-button link size="small" :loading="busyId === row.id" @click="toggleTop(row)">
                {{ row.isTop ? '取消置顶' : '置顶' }}
              </el-button>
              <el-button
                link
                type="danger"
                size="small"
                :loading="busyId === row.id"
                @click="remove(row)"
              >
                删除
              </el-button>
            </template>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <div class="py-10 text-center">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{ filters.keyword ? '没有匹配的文章' : '这里还没有文章' }}
          </p>
          <NuxtLink to="/dashboard/articles/new" class="btn-primary btn-sm mt-3 inline-flex">
            写第一篇
          </NuxtLink>
        </div>
      </template>
    </el-table>

    <div v-if="total > 0" class="mt-4 flex justify-end">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[12, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="goPage"
        @size-change="resizePage"
      />
    </div>
  </div>
</template>
