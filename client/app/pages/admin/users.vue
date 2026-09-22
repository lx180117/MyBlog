<script setup lang="ts">
import type { UserAdminViewDto, UserProfileDto, UserStatsDto, OperationResultDto, ResetPasswordResultDto } from '~/types/api';
import type { Paginated } from '~/types/pagination';
import { USER_ROLES, USER_ROLE_META, type UserStatus } from '~/types/domain';
import { alertText, confirmDanger, errorText, notifyError, notifyOk, promptText } from '~/utils/dialog';

definePageMeta({ layout: 'console', middleware: ['admin'] });

const api = useApi();
const auth = useAuth();
const route = useRoute();

const stats = ref<UserStatsDto | null>(null);
const busyId = ref('');

const selfId = computed(() => auth.state.value.user?.id ?? '');

const { page, pageSize, filters, items, total, loading, error, load, reload, goPage, resizePage, reloadAfterRemove } =
  usePagedList<
    UserAdminViewDto,
    { status: string; role: string; keyword: string; hasArticles: boolean }
  >(
    (q) =>
      api.get<Paginated<UserAdminViewDto>>('/admin/users', {
        query: {
          page: q.page,
          pageSize: q.pageSize,
          status: q.status,
          role: q.role,
          keyword: q.keyword.trim(),
          // 布尔筛选：false 时不传，避免出现 hasArticles=false 这种无意义条件
          hasArticles: q.hasArticles ? true : undefined,
        },
      }),
    {
      // 从仪表盘的「待审核用户」卡片进来时带着 ?status=pending
      status: String(route.query.status ?? ''),
      role: '',
      keyword: '',
      hasArticles: false,
    },
  );

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '已禁用' },
];

async function loadStats() {
  try {
    stats.value = await api.get<UserStatsDto>('/admin/users/stats');
  } catch {
    /* 统计失败不影响列表 */
  }
}

onMounted(() => {
  void load();
  void loadStats();
});

/**
 * URL 上的 status 变化时同步筛选。
 * 场景：在「全部」页点侧边栏进来时带 query，或从仪表盘卡片跳过来 ——
 * 同一路由只换 query，页面不会重建，所以必须显式监听。
 */
watch(
  () => route.query.status,
  (value) => {
    const next = String(value ?? '');
    if (next === filters.status) return;
    filters.status = next;
    void reload();
  },
);

function resetFilters() {
  filters.status = '';
  filters.role = '';
  filters.keyword = '';
  filters.hasArticles = false;
  void reload();
}

/* ------------------------------------------------------------ 操作 */

/**
 * Element Plus 的表格插槽把 row 声明成 `Record<PropertyKey, any>`，
 * 传不进强类型的函数。下面所有「从模板直接调用」的函数都统一用 unknown
 * 接收、在开头收窄一次，避免在每个调用点写 `row as UserAdminViewDto`。
 */
function asUser(raw: unknown): UserAdminViewDto {
  return raw as UserAdminViewDto;
}

/** 角色标签的展示映射（模板里要用，所以单独包一层） */
function roleMetaOf(raw: unknown) {
  return USER_ROLE_META[asUser(raw).role];
}

function isSelf(raw: unknown): boolean {
  return asUser(raw).id === selfId.value;
}

async function run(row: UserAdminViewDto, fn: () => Promise<void>, successMessage: string) {
  busyId.value = row.id;
  try {
    await fn();
    notifyOk(successMessage);
    await loadStats();
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}

function setStatus(row: UserAdminViewDto, status: UserStatus, successMessage: string) {
  return run(
    row,
    async () => {
      const res = await api.patch<UserProfileDto>(`/admin/users/${row.id}/status`, { status });
      row.status = res.status as UserAdminViewDto['status'];
    },
    successMessage,
  );
}

const approve = (raw: unknown) => {
  const row = asUser(raw);
  return setStatus(row, 'active', `已通过「${row.nickname}」的注册申请`);
};

const enable = (raw: unknown) => {
  const row = asUser(raw);
  return setStatus(row, 'active', `已启用「${row.nickname}」`);
};

const disable = (raw: unknown) => {
  const row = asUser(raw);
  return setStatus(row, 'disabled', `已禁用「${row.nickname}」`);
};

async function changeRole(raw: unknown, value: unknown) {
  const row = asUser(raw);
  const role = String(value) as 'admin' | 'author';
  if (role === row.role) return;

  const label = USER_ROLE_META[role]?.label ?? role;
  const ok = await confirmDanger(`把「${row.nickname}」的角色改为「${label}」？`, {
    title: '调整角色',
    confirmText: '确认修改',
  });
  if (!ok) {
    // 用户取消：把下拉框恢复成原值，否则界面会显示一个并未生效的角色
    await load();
    return;
  }

  await run(
    row,
    async () => {
      const res = await api.patch<UserProfileDto>(`/admin/users/${row.id}/role`, { role });
      row.role = res.role as UserAdminViewDto['role'];
    },
    `已把「${row.nickname}」设为${label}`,
  );
}

/**
 * 重置密码。后端允许不传新密码 —— 那时它会随机生成一个并在响应里明文返回，
 * 由管理员转告用户。所以这里必须把这个一次性可见的密码用弹窗亮出来，
 * 用一句 toast 会瞬间消失，管理员根本来不及记。
 */
async function resetPassword(raw: unknown) {
  const row = asUser(raw);

  const input = await promptText(
    `为「${row.nickname}」设置新密码。留空则由系统随机生成一个。`,
    '重置密码',
    '新密码（留空自动生成）',
  );
  if (input === null) return; // 用户取消

  busyId.value = row.id;
  try {
    const res = await api.post<ResetPasswordResultDto>(`/admin/users/${row.id}/reset-password`, {
      newPassword: input.trim() || undefined,
    });
    await alertText(
      `新密码：${res.temporaryPassword}\n\n请通过安全渠道转告用户，并提醒他尽快登录修改。此密码只显示这一次。`,
      '重置成功',
      '我已记下',
    );
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}

async function removeUser(raw: unknown) {
  const row = asUser(raw);

  const ok = await confirmDanger(
    `删除「${row.nickname}」（${row.username}）的账号，不可恢复。\n\n注意：该用户如果还有文章（当前 ${row.articleCount} 篇），后端会拒绝删除 —— 先把文章转到别人名下或彻底删除。`,
    { title: '删除账号', confirmText: '删除账号' },
  );
  if (!ok) return;

  busyId.value = row.id;
  try {
    const res = await api.del<OperationResultDto>(`/admin/users/${row.id}`);
    notifyOk(res?.message ?? '账号已删除');
    await reloadAfterRemove(1);
    await loadStats();
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}
</script>

<template>
  <div>
    <ConsolePageHeader
      title="用户管理"
      description="新注册的账号默认是「待审核」，通过后才能发文。删账号前必须先把他的文章处理掉。"
    />

    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <ConsoleStatTile label="用户总数" :value="stats ? stats.total : '—'" />
      <ConsoleStatTile
        label="待审核"
        :value="stats ? stats.pending : '—'"
        tone="warning"
        hint="需要处理"
        :to="{ path: '/admin/users', query: { status: 'pending' } }"
      />
      <ConsoleStatTile label="已激活" :value="stats ? stats.active : '—'" tone="success" />
      <ConsoleStatTile label="已禁用" :value="stats ? stats.disabled : '—'" tone="danger" />
      <ConsoleStatTile label="管理员" :value="stats ? stats.admins : '—'" tone="info" />
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <el-radio-group v-model="filters.status" @change="reload()">
        <el-radio-button v-for="tab in STATUS_TABS" :key="tab.value" :value="tab.value">
          {{ tab.label }}
        </el-radio-button>
      </el-radio-group>

      <el-select v-model="filters.role" placeholder="全部角色" clearable class="w-32" @change="reload()">
        <el-option
          v-for="role in USER_ROLES"
          :key="role"
          :label="USER_ROLE_META[role].label"
          :value="role"
        />
      </el-select>

      <el-input
        v-model="filters.keyword"
        placeholder="搜索用户名 / 昵称 / 邮箱"
        clearable
        class="max-w-64"
        @keyup.enter="reload()"
        @clear="reload()"
      >
        <template #append>
          <el-button @click="reload()">搜索</el-button>
        </template>
      </el-input>

      <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <el-switch v-model="filters.hasArticles" @change="reload()" />
        只看有文章的
      </label>

      <el-button link size="small" class="ml-auto" @click="resetFilters">重置筛选</el-button>
    </div>

    <el-alert v-if="error" type="error" show-icon :closable="false" class="mb-4" :title="error" />

    <el-table v-loading="loading" :data="items" row-key="id" class="w-full">
      <el-table-column label="用户" min-width="240">
        <template #default="{ row }">
          <div class="flex items-center gap-3">
            <SiteAuthorAvatar :src="row.avatarUrl" :name="row.nickname" :seed="row.username" :size="34" />
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="truncate font-medium text-slate-800 dark:text-slate-100">
                  {{ row.nickname }}
                </span>
                <span
                  v-if="isSelf(row)"
                  class="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  当前账号
                </span>
              </div>
              <a
                :href="`/author/${row.username}`"
                target="_blank"
                rel="noopener"
                class="block truncate text-xs text-slate-400 hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400"
              >
                @{{ row.username }} · {{ row.email }}
              </a>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="角色" width="120">
        <template #default="{ row }">
          <!-- 不能调整自己的角色（后端也有这道保护：不能取消自己的管理员身份） -->
          <el-select
            v-if="!isSelf(row)"
            :model-value="asUser(row).role"
            size="small"
            :disabled="busyId === asUser(row).id"
            @change="changeRole(row, $event)"
          >
            <el-option
              v-for="role in USER_ROLES"
              :key="role"
              :label="USER_ROLE_META[role].label"
              :value="role"
            />
          </el-select>
          <el-tag v-else :type="roleMetaOf(row).tone" size="small" effect="light" round>
            {{ roleMetaOf(row).label }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="92">
        <template #default="{ row }">
          <ConsoleStatusTag :status="row.status" kind="user" />
        </template>
      </el-table-column>

      <el-table-column label="文章" width="70">
        <template #default="{ row }">
          <span class="text-sm tabular-nums text-slate-600 dark:text-slate-300">
            {{ row.articleCount }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="注册 / 最近登录" width="170">
        <template #default="{ row }">
          <div class="text-xs text-slate-500 dark:text-slate-400">
            <div>{{ formatDate(row.createdAt) }}</div>
            <div class="mt-0.5 text-slate-400 dark:text-slate-500">
              {{ row.lastLoginAt ? formatDateTime(row.lastLoginAt) : '从未登录' }}
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <div class="flex flex-wrap items-center gap-x-2">
            <template v-if="!isSelf(row)">
              <el-button
                v-if="row.status !== 'active'"
                link
                type="success"
                size="small"
                :loading="busyId === row.id"
                @click="row.status === 'pending' ? approve(row) : enable(row)"
              >
                {{ row.status === 'pending' ? '通过' : '启用' }}
              </el-button>
              <el-button
                v-if="row.status === 'active'"
                link
                type="warning"
                size="small"
                :loading="busyId === row.id"
                @click="disable(row)"
              >
                禁用
              </el-button>
              <el-button link size="small" :loading="busyId === row.id" @click="resetPassword(row)">
                重置密码
              </el-button>
              <el-button
                link
                type="danger"
                size="small"
                :loading="busyId === row.id"
                @click="removeUser(row)"
              >
                删除
              </el-button>
            </template>
            <span v-else class="text-xs text-slate-400 dark:text-slate-500">不能操作自己</span>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <div class="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {{ filters.keyword ? '没有匹配的用户' : '没有用户' }}
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
