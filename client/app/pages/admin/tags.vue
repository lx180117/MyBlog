<script setup lang="ts">
import type { CreateTagDto, TagResponseDto } from '~/types/api';
import { confirmDanger, errorText, notifyError, notifyOk } from '~/utils/dialog';

/**
 * 标签管理。
 *
 * 与分类不同的地方：标签是**开放**的 —— 作者写文章时可以直接新建标签
 * （FR-3.2），不受管理员控制。所以后台这里的职责不是「分配」，而是
 * 「收拾」：删掉写错的、把同义的合并成一个。合并接口的存在就是为了这个。
 */
definePageMeta({ layout: 'console', middleware: ['admin'] });

const api = useApi();
const { tags, loadTaxonomy } = useTaxonomy();

const loading = ref(false);
const keyword = ref('');
const busyId = ref('');

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return tags.value;
  return tags.value.filter((t) => t.name.toLowerCase().includes(kw) || t.slug.includes(kw));
});

/** 按文章数倒序，一眼看出哪些标签真在用 */
const sorted = computed(() => [...filtered.value].sort((a, b) => b.articleCount - a.articleCount));

async function refresh() {
  loading.value = true;
  try {
    await loadTaxonomy(true);
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

/* ------------------------------------------------------------ 新建 */

const createVisible = ref(false);
const saving = ref(false);
const form = reactive({ name: '', slug: '' });

function openCreate() {
  Object.assign(form, { name: '', slug: '' });
  createVisible.value = true;
}

async function submitCreate() {
  if (!form.name.trim()) {
    notifyError('标签名不能为空');
    return;
  }
  saving.value = true;
  try {
    const payload: CreateTagDto = { name: form.name.trim(), slug: form.slug.trim() || undefined };
    await api.post<TagResponseDto>('/admin/tags', payload);
    notifyOk('标签已创建');
    createVisible.value = false;
    await refresh();
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    saving.value = false;
  }
}

/* ------------------------------------------------------------ 删除 */

async function remove(raw: unknown) {
  // 表格插槽给的 row 是无类型数据，在这里收窄一次（原因同 ArticleTable）
  const row = raw as TagResponseDto;
  const ok = await confirmDanger(
    row.articleCount
      ? `「${row.name}」被 ${row.articleCount} 篇文章使用，删除后这些文章会失去该标签（文章本身不受影响）。`
      : `删除标签「${row.name}」。`,
    { title: '删除标签', confirmText: '删除' },
  );
  if (!ok) return;

  busyId.value = row.id;
  try {
    const res = await api.del<{ success: boolean; message: string }>(`/admin/tags/${row.id}`);
    notifyOk(res?.message ?? '标签已删除');
    await refresh();
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    busyId.value = '';
  }
}

/* ------------------------------------------------------------ 合并 */

const mergeVisible = ref(false);
const merging = ref(false);
const mergeSource = ref<string[]>([]);
const mergeTarget = ref<string | null>(null);

function openMerge() {
  mergeSource.value = [];
  mergeTarget.value = null;
  mergeVisible.value = true;
}

const targetName = computed(
  () => tags.value.find((t) => t.id === mergeTarget.value)?.name ?? '',
);

/** 真正会被删掉的源标签：要排掉用户误选的目标标签自己 */
const effectiveSources = computed(() =>
  mergeSource.value.filter((id) => id !== mergeTarget.value),
);

async function submitMerge() {
  if (!mergeTarget.value) {
    notifyError('请选择保留哪个标签');
    return;
  }
  if (!effectiveSources.value.length) {
    notifyError('请至少选择一个要被合并掉的标签');
    return;
  }

  const ok = await confirmDanger(
    `这 ${effectiveSources.value.length} 个标签会被删除，它们名下的文章改挂到「${targetName.value}」下。此操作不可撤销。`,
    { title: '合并标签', confirmText: '合并' },
  );
  if (!ok) return;

  merging.value = true;
  try {
    const res = await api.post<{ success: boolean; message: string; movedArticles: number }>(
      '/admin/tags/merge',
      { sourceTagIds: effectiveSources.value, targetTagId: mergeTarget.value },
    );
    notifyOk(res?.message ?? '标签已合并');
    mergeVisible.value = false;
    await refresh();
  } catch (e) {
    notifyError(errorText(e));
  } finally {
    merging.value = false;
  }
}
</script>

<template>
  <div>
    <ConsolePageHeader
      title="标签管理"
      description="标签是开放给作者的 —— 他们在发文时可以直接创建。这里主要用来删掉写错的、把重复的合并成一个。"
    >
      <template #actions>
        <el-input v-model="keyword" placeholder="搜索标签" clearable size="small" class="w-44" />
        <el-button size="small" @click="openMerge">合并标签</el-button>
        <el-button type="primary" size="small" @click="openCreate">新建标签</el-button>
      </template>
    </ConsolePageHeader>

    <div class="card p-4">
      <el-table v-loading="loading" :data="sorted" row-key="id" class="w-full">
        <el-table-column label="标签" min-width="200">
          <template #default="{ row }">
            <div>
              <span class="tag-chip">{{ row.name }}</span>
              <div class="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
                /tags/{{ row.slug }}
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="文章数" width="110" align="center">
          <template #default="{ row }">
            <NuxtLink
              v-if="row.articleCount"
              :to="`/tags/${row.slug}`"
              target="_blank"
              class="text-sm tabular-nums text-brand-600 hover:underline dark:text-brand-400"
            >
              {{ row.articleCount }}
            </NuxtLink>
            <span v-else class="text-xs text-slate-400 dark:text-slate-500">未被使用</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
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
            {{ keyword ? '没有匹配的标签' : '还没有标签' }}
          </div>
        </template>
      </el-table>
    </div>

    <!-- 新建标签 -->
    <el-dialog v-model="createVisible" title="新建标签" width="420px" :close-on-click-modal="false">
      <div class="space-y-4">
        <div>
          <label class="label">标签名</label>
          <el-input v-model="form.name" maxlength="30" placeholder="例如：PostgreSQL" />
        </div>
        <div>
          <label class="label">URL 标识（slug）</label>
          <el-input v-model="form.slug" placeholder="留空按名称生成" />
        </div>
      </div>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 合并标签 -->
    <el-dialog v-model="mergeVisible" title="合并标签" width="520px" :close-on-click-modal="false">
      <div class="space-y-4">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>把多个同义标签并成一个</template>
          <p class="mt-1 text-xs">
            被合并的标签会连同它的关联记录一起删除，文章本身不受影响 ——
            它们会改挂到「保留的标签」下。
          </p>
        </el-alert>

        <div>
          <label class="label">要合并掉的标签（可多选）</label>
          <el-select
            v-model="mergeSource"
            multiple
            filterable
            placeholder="选择重复/写错的标签"
            class="w-full"
          >
            <el-option
              v-for="tag in sorted"
              :key="tag.id"
              :label="`${tag.name}（${tag.articleCount} 篇）`"
              :value="tag.id"
            />
          </el-select>
        </div>

        <div>
          <label class="label">保留的目标标签</label>
          <el-select v-model="mergeTarget" filterable placeholder="选一个留下来" class="w-full">
            <el-option
              v-for="tag in sorted"
              :key="tag.id"
              :label="`${tag.name}（${tag.articleCount} 篇）`"
              :value="tag.id"
            />
          </el-select>
        </div>

        <p v-if="mergeTarget && effectiveSources.length" class="text-xs text-slate-500 dark:text-slate-400">
          将把 {{ effectiveSources.length }} 个标签的文章并入「{{ targetName }}」。
        </p>
      </div>

      <template #footer>
        <el-button @click="mergeVisible = false">取消</el-button>
        <el-button type="primary" :loading="merging" @click="submitMerge">合并</el-button>
      </template>
    </el-dialog>
  </div>
</template>
