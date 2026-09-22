<script setup lang="ts">
import type { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from '~/types/api';
import { confirmDanger, errorText, notifyError, notifyOk } from '~/utils/dialog';

/**
 * 分类管理。
 *
 * 读的是**公开**接口（GET /categories），通过 useTaxonomy 的全局缓存拿 ——
 * 后台改完调用 `loadTaxonomy(true)` 强制刷新，这份缓存同时喂给文章编辑器的
 * 分类下拉框，所以新增分类后作者那边不用刷新页面就能选到。
 */
definePageMeta({ layout: 'console', middleware: ['admin'] });

const api = useApi();
const { categories, loadTaxonomy } = useTaxonomy();

const loading = ref(false);
const keyword = ref('');
const busyId = ref('');

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return categories.value;
  return categories.value.filter(
    (c) =>
      c.name.toLowerCase().includes(kw) ||
      c.slug.toLowerCase().includes(kw) ||
      (c.description ?? '').toLowerCase().includes(kw),
  );
});

async function refresh() {
  loading.value = true;
  try {
    await loadTaxonomy(true);
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

/* ------------------------------------------------------------ 新建 / 编辑 */

const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = reactive({ name: '', slug: '', description: '', sortOrder: 0 });

function openCreate() {
  editingId.value = null;
  // 新分类的排序值默认排到最后，符合直觉
  Object.assign(form, { name: '', slug: '', description: '', sortOrder: categories.value.length });
  dialogVisible.value = true;
}

function openEdit(raw: unknown) {
  // 表格插槽给的 row 是无类型数据，在这里收窄一次（原因同 ArticleTable）
  const row = raw as CategoryResponseDto;
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    sortOrder: row.sortOrder,
  });
  dialogVisible.value = true;
}

async function submit() {
  if (!form.name.trim()) {
    notifyError('分类名不能为空');
    return;
  }

  saving.value = true;
  try {
    const payload: CreateCategoryDto = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || undefined,
      sortOrder: Number(form.sortOrder) || 0,
    };

    if (editingId.value) {
      await api.patch<CategoryResponseDto>(`/admin/categories/${editingId.value}`, payload as UpdateCategoryDto);
      notifyOk('分类已更新');
    } else {
      await api.post<CategoryResponseDto>('/admin/categories', payload);
      notifyOk('分类已创建');
    }
    dialogVisible.value = false;
    await refresh();
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    saving.value = false;
  }
}

async function remove(raw: unknown) {
  // 表格插槽给的 row 是无类型数据，在这里收窄一次（原因同 ArticleTable）
  const row = raw as CategoryResponseDto;
  const ok = await confirmDanger(
    row.articleCount
      ? `「${row.name}」下有 ${row.articleCount} 篇文章。删除分类**不会删文章**，它们会变成「未分类」。`
      : `删除分类「${row.name}」。`,
    { title: '删除分类', confirmText: '删除' },
  );
  if (!ok) return;

  busyId.value = row.id;
  try {
    const res = await api.del<{ success: boolean; message: string; affectedArticles: number }>(
      `/admin/categories/${row.id}`,
    );
    notifyOk(res?.message ?? '分类已删除');
    await refresh();
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
      title="分类管理"
      description="分类由管理员统一维护，作者发文时只能从已有分类里选。排序值越小越靠前。"
    >
      <template #actions>
        <el-input v-model="keyword" placeholder="搜索分类" clearable size="small" class="w-44" />
        <el-button type="primary" size="small" @click="openCreate">新建分类</el-button>
      </template>
    </ConsolePageHeader>

    <div class="card p-4">
      <el-table v-loading="loading" :data="filtered" row-key="id" class="w-full">
        <el-table-column label="分类" min-width="200">
          <template #default="{ row }">
            <div>
              <div class="font-medium text-slate-800 dark:text-slate-100">{{ row.name }}</div>
              <div class="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                /categories/{{ row.slug }}
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="描述" min-width="220">
          <template #default="{ row }">
            <span class="text-sm text-slate-500 dark:text-slate-400">
              {{ row.description || '—' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="文章数" width="90" align="center">
          <template #default="{ row }">
            <NuxtLink
              v-if="row.articleCount"
              :to="`/categories/${row.slug}`"
              target="_blank"
              class="text-sm tabular-nums text-brand-600 hover:underline dark:text-brand-400"
            >
              {{ row.articleCount }}
            </NuxtLink>
            <span v-else class="text-sm tabular-nums text-slate-400 dark:text-slate-500">0</span>
          </template>
        </el-table-column>

        <el-table-column label="排序" width="80" align="center">
          <template #default="{ row }">
            <span class="text-sm tabular-nums text-slate-500 dark:text-slate-400">
              {{ row.sortOrder }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
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
        </el-table-column>

        <template #empty>
          <div class="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            还没有分类。建几个分类能让读者更容易找到内容。
          </div>
        </template>
      </el-table>
    </div>

    <!-- 新建 / 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑分类' : '新建分类'"
      width="480px"
      :close-on-click-modal="false"
    >
      <div class="space-y-4">
        <div>
          <label class="label">分类名</label>
          <el-input v-model="form.name" maxlength="50" placeholder="例如：后端开发" />
        </div>
        <div>
          <label class="label">URL 标识（slug）</label>
          <el-input v-model="form.slug" placeholder="留空按名称生成，如 backend" />
          <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
            只能用小写字母、数字和短横线
          </p>
        </div>
        <div>
          <label class="label">描述</label>
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </div>
        <div>
          <label class="label">排序值</label>
          <el-input-number v-model="form.sortOrder" :min="0" :max="999" />
          <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">越小越靠前</p>
        </div>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
