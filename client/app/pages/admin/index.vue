<script setup lang="ts">
import type { OverviewDto } from '~/types/api';

definePageMeta({ layout: 'console', middleware: ['admin'] });

const api = useApi();

const overview = ref<OverviewDto | null>(null);
const days = ref(7);
const metric = ref<'views' | 'comments' | 'articles'>('views');
const loading = ref(false);
const error = ref('');

const METRICS = [
  { value: 'views', label: '访问量' },
  { value: 'comments', label: '评论数' },
  { value: 'articles', label: '发文数' },
] as const;

const DAY_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    overview.value = await api.get<OverviewDto>('/admin/stats/overview', {
      query: { days: days.value },
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '统计数据加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(days, load);

const a = computed(() => overview.value?.articles);
const u = computed(() => overview.value?.users);
const c = computed(() => overview.value?.comments);
const v = computed(() => overview.value?.views);
</script>

<template>
  <div>
    <ConsolePageHeader title="仪表盘" description="全站概况。带底色的卡片是可点的，点进去就是对应的列表。">
      <template #actions>
        <NuxtLink to="/dashboard/articles/new" class="btn-primary btn-sm">写新文章</NuxtLink>
        <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      </template>
    </ConsolePageHeader>

    <el-alert v-if="error" type="error" show-icon :closable="false" class="mb-4" :title="error" />

    <!-- 需要处理的 / 今日 -->
    <div class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ConsoleStatTile
        label="待审核评论"
        :value="c ? c.pending : '—'"
        tone="warning"
        hint="需要处理"
        :to="{ path: '/admin/comments', query: { status: 'pending' } }"
      />
      <ConsoleStatTile
        label="待审核用户"
        :value="u ? u.pending : '—'"
        tone="warning"
        hint="需要处理"
        :to="{ path: '/admin/users', query: { status: 'pending' } }"
      />
      <ConsoleStatTile label="今日访问" :value="v ? v.today : '—'" />
      <ConsoleStatTile label="今日注册" :value="u ? u.todayNew : '—'" tone="success" />
    </div>

    <!-- 累计 -->
    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ConsoleStatTile
        label="文章总数"
        :value="a ? a.total : '—'"
        :hint="a ? `已发布 ${a.published} · 草稿 ${a.draft} · 定时 ${a.scheduled}` : undefined"
      />
      <ConsoleStatTile
        label="评论总数"
        :value="c ? c.approved + c.pending + c.rejected : '—'"
        :hint="c ? `已通过 ${c.approved} · 待审 ${c.pending}` : undefined"
      />
      <ConsoleStatTile
        label="用户总数"
        :value="u ? u.total : '—'"
        :hint="u ? `管理员 ${u.admins} · 已禁用 ${u.disabled}` : undefined"
        tone="info"
      />
      <ConsoleStatTile
        label="累计访问"
        :value="v ? v.total : '—'"
        :hint="v ? `近 7 天 ${v.last7Days}` : undefined"
        tone="success"
      />
    </div>

    <!-- 趋势 -->
    <div class="card p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <el-radio-group v-model="metric" size="small">
          <el-radio-button v-for="item in METRICS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>

        <el-radio-group v-model="days" size="small">
          <el-radio-button v-for="item in DAY_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <ConsoleTrendChart
        :points="overview?.trend ?? []"
        :metric="metric"
        :loading="loading && !overview"
      />
    </div>

    <!-- 站点进度小结：把「今天要做什么」摊在明面上 -->
    <div class="mt-5 grid gap-3 sm:grid-cols-3">
      <div class="card p-4">
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">内容</p>
        <p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          共 {{ a?.total ?? 0 }} 篇，其中
          <span class="font-medium text-slate-700 dark:text-slate-300">{{ a?.published ?? 0 }}</span>
          篇已发布。
          <template v-if="a && a.draft">还有 {{ a.draft }} 篇草稿没发。</template>
        </p>
        <NuxtLink to="/admin/articles" class="mt-2 inline-block text-xs text-brand-600 hover:underline dark:text-brand-400">
          去看全部文章 →
        </NuxtLink>
      </div>

      <div class="card p-4">
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">社区</p>
        <p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {{ u?.active ?? 0 }} 个已激活作者，今天新增 {{ u?.todayNew ?? 0 }} 位注册用户。
        </p>
        <NuxtLink to="/admin/users" class="mt-2 inline-block text-xs text-brand-600 hover:underline dark:text-brand-400">
          管理用户 →
        </NuxtLink>
      </div>

      <div class="card p-4">
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">待办</p>
        <p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          <template v-if="(c?.pending ?? 0) + (u?.pending ?? 0) === 0">
            没有待处理的审核，一切干净。
          </template>
          <template v-else>
            有 {{ c?.pending ?? 0 }} 条评论、{{ u?.pending ?? 0 }} 个账号等着审核。
          </template>
        </p>
        <NuxtLink
          :to="{ path: '/admin/comments', query: { status: 'pending' } }"
          class="mt-2 inline-block text-xs text-brand-600 hover:underline dark:text-brand-400"
        >
          去处理 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
