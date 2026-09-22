<script setup lang="ts">
import type { ArticleManageDto } from '~/types/api';
import { toLocalDateTimeInput } from '~/utils/dialog';
import { confirmDanger, errorText, notifyError, notifyOk } from '~/utils/dialog';

/**
 * 文章编辑器。新建（无 articleId）与编辑（有 articleId）共用同一个组件 ——
 * 两条路径的字段、校验、保存逻辑完全相同，拆成两个页面必然会出现
 * 「新建能选分类、编辑不能」这类逐渐扩大的差异。
 */
const props = defineProps<{ articleId?: string }>();

const api = useApi();
const router = useRouter();
const auth = useAuth();
const config = useRuntimeConfig();
const { categories, loadTaxonomy, categoryOptions, tagNames } = useTaxonomy();
const { uploading: coverUploading, pickAndUpload } = useImageUpload();

const siteUrl = computed(() => String(config.public.siteUrl).replace(/\/$/, ''));

/* ------------------------------------------------------------ 表单状态 */

const form = reactive({
  title: '',
  slug: '',
  summary: '',
  coverUrl: '',
  categoryId: null as string | null,
  tags: [] as string[],
  content: '',
  isTop: false,
});

/** 定时发布时间（datetime-local 的本地字符串，空串=立即发布） */
const scheduledAt = ref('');

const current = ref<ArticleManageDto | null>(null);
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const coverInput = ref<HTMLInputElement | null>(null);
const errors = reactive<{ title: string; content: string }>({ title: '', content: '' });

const isNew = computed(() => !props.articleId);
const isDeleted = computed(() => current.value?.status === 'deleted');
const isPublished = computed(() => current.value?.status === 'published');
const isScheduled = computed(() => {
  if (!isPublished.value || !current.value?.publishedAt) return false;
  return new Date(current.value.publishedAt).getTime() > Date.now();
});
/** 待审核账号后端会拒绝一切写操作（@RequireActive），前端就别让他白填一遍 */
const blocked = computed(() => !auth.canPublish.value || isDeleted.value);

const publicUrl = computed(() =>
  isNew.value || !current.value
    ? ''
    : `${siteUrl.value}/articles/${current.value.slug}`,
);

/* ------------------------------------------------------------ 脏数据跟踪 */

let savedSnapshot = '';
let skipLeaveGuard = false;

function snapshot(): string {
  return JSON.stringify({
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    coverUrl: form.coverUrl,
    categoryId: form.categoryId,
    tags: [...form.tags].sort(),
    content: form.content,
    isTop: form.isTop,
    scheduledAt: scheduledAt.value,
  });
}

const dirty = computed(() => savedSnapshot !== snapshot());

/* ------------------------------------------------------------ 加载 */

async function load() {
  await loadTaxonomy();
  if (!props.articleId) {
    savedSnapshot = snapshot();
    return;
  }

  loading.value = true;
  loadError.value = '';
  try {
    const a = await api.get<ArticleManageDto>(`/me/articles/${props.articleId}`);
    current.value = a;
    form.title = a.title;
    form.slug = a.slug;
    form.summary = a.summary;
    form.coverUrl = a.coverUrl ?? '';
    form.categoryId = a.categoryId ?? null;
    form.tags = [...a.tags];
    form.content = a.content;
    form.isTop = a.isTop;
    // 只有「已发布且时间在未来」才算定时发布，否则会误显示成定时
    scheduledAt.value =
      a.status === 'published' && a.publishedAt && new Date(a.publishedAt).getTime() > Date.now()
        ? toLocalDateTimeInput(a.publishedAt)
        : '';
    savedSnapshot = snapshot();
  } catch (e) {
    loadError.value = errorText(e, '文章加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.articleId, load);

/* ------------------------------------------------------------ 封面 / 摘要 */

function pickCover() {
  coverInput.value?.click();
}

async function onCoverPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  const res = await pickAndUpload(file, '封面上传成功');
  if (res) form.coverUrl = res.url;
}

/** 从正文生成摘要：去掉代码块、图片、标题符号、链接语法，截前 200 字 */
function generateSummary() {
  const text = form.content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  form.summary = text.slice(0, 200);
  notifyOk('已从正文生成摘要');
}

/* ------------------------------------------------------------ 保存 */

function validate(): boolean {
  errors.title = form.title.trim() ? '' : '标题不能为空';
  errors.content = form.content.trim() ? '' : '正文不能为空';
  return !errors.title && !errors.content;
}

async function save(status: 'draft' | 'published') {
  if (!validate()) {
    notifyError('还有必填项没有填完');
    return;
  }
  if (status === 'published' && !auth.canPublish.value) {
    notifyError('账号尚未激活，暂时无法发布');
    return;
  }

  saving.value = true;
  try {
    // 只在「发布 + 填了时间」时带 publishedAt；否则让它服务端取当前时间
    const publishedAt =
      status === 'published' && scheduledAt.value
        ? new Date(scheduledAt.value).toISOString()
        : undefined;

    const payload = {
      title: form.title.trim(),
      content: form.content,
      // 传空串而不是 undefined：后端约定空摘要会从正文自动截取，
      // 传 undefined 则会保留旧摘要，作者就清不掉它了
      summary: form.summary.trim(),
      slug: form.slug.trim() || undefined,
      coverUrl: form.coverUrl.trim(),
      categoryId: form.categoryId || null,
      tags: form.tags,
      isTop: form.isTop,
      status,
      publishedAt,
    };

    const saved = props.articleId
      ? await api.patch<ArticleManageDto>(`/me/articles/${props.articleId}`, payload)
      : await api.post<ArticleManageDto>('/me/articles', payload);

    current.value = saved;
    form.slug = saved.slug;
    savedSnapshot = snapshot();

    const scheduled =
      saved.status === 'published' &&
      !!saved.publishedAt &&
      new Date(saved.publishedAt).getTime() > Date.now();

    notifyOk(scheduled ? '已设为定时发布，到点自动上线' : saved.status === 'published' ? '文章已发布' : '草稿已保存');

    if (isNew.value) {
      // 切到编辑态：不重新加载，直接替换 URL
      skipLeaveGuard = true;
      await router.replace(`/dashboard/articles/${saved.id}`);
      skipLeaveGuard = false;
    }
  } catch (e) {
    notifyError(errorText(e, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function restore() {
  if (!props.articleId) return;
  if (!(await confirmDanger('恢复后会回到草稿状态，需要重新发布。确定恢复吗？', { title: '从回收站恢复', confirmText: '恢复' }))) {
    return;
  }
  try {
    const a = await api.post<ArticleManageDto>(`/me/articles/${props.articleId}/restore`);
    notifyOk('已恢复到草稿');
    current.value = a;
    savedSnapshot = snapshot();
  } catch (e) {
    notifyError(errorText(e, '恢复失败'));
  }
}

/* ------------------------------------------------------------ 离开保护 */

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return;
  e.preventDefault();
  e.returnValue = '';
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (!blocked.value && !saving.value) void save('draft');
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
  window.removeEventListener('keydown', onKeydown);
});

onBeforeRouteLeave(async () => {
  if (skipLeaveGuard || !dirty.value) return true;
  return await confirmDanger('当前修改还没有保存，确定要离开吗？', {
    title: '放弃修改',
    confirmText: '离开',
  });
});
</script>

<template>
  <div>
    <ConsolePageHeader
      :title="isNew ? '写新文章' : isDeleted ? '回收站中的文章' : '编辑文章'"
      :description="
        isNew
          ? '标题和正文是必填项，其余都可以之后再补。Ctrl / ⌘ + S 存草稿。'
          : `创建于 ${formatDateTime(current?.createdAt)} · 最后更新 ${formatDateTime(current?.updatedAt)}`
      "
    >
      <template #actions>
        <a
          v-if="publicUrl && isPublished && !isScheduled"
          :href="publicUrl"
          target="_blank"
          rel="noopener"
          class="btn-ghost btn-sm"
        >
          查看前台
        </a>
        <NuxtLink to="/dashboard" class="btn-ghost btn-sm">返回列表</NuxtLink>
      </template>
    </ConsolePageHeader>

    <!-- 加载失败（不存在 / 不是自己的文章） -->
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <!-- 回收站 -->
    <el-alert v-if="isDeleted" type="warning" show-icon :closable="false" class="mb-4">
      <template #title>这篇文章在回收站里，不能直接修改</template>
      <div class="mt-1 flex items-center gap-3">
        <span class="text-xs">恢复后状态回到草稿，需要重新发布。</span>
        <el-button type="primary" size="small" @click="restore">从回收站恢复</el-button>
      </div>
    </el-alert>

    <!-- 账号未激活 -->
    <el-alert
      v-else-if="!auth.canPublish.value"
      type="warning"
      show-icon
      :closable="false"
      class="mb-4"
      title="账号还在等待管理员审核，暂时不能创建或发布文章"
      description="审核通过后这里就可以正常保存了。可以先在「个人资料」里完善昵称、头像和简介。"
    />

    <div v-if="loading" class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div class="skeleton h-[520px]" />
      <div class="skeleton h-[420px]" />
    </div>

    <div v-else class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <!-- ------------------------------------------------ 主编辑区 -->
      <div class="min-w-0 space-y-4">
        <div>
          <input
            v-model="form.title"
            type="text"
            placeholder="文章标题"
            :disabled="blocked"
            class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xl font-semibold
                   text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400
                   focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20
                   disabled:cursor-not-allowed disabled:bg-slate-50
                   dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600
                   dark:disabled:bg-slate-900/50"
          />
          <p v-if="errors.title" class="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
            {{ errors.title }}
          </p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">URL 标识（slug）</label>
            <el-input
              v-model="form.slug"
              placeholder="留空则按标题自动生成"
              :disabled="blocked"
            />
            <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
              <template v-if="form.slug">/articles/{{ form.slug }}</template>
              <template v-else>中文会原样保留，重名自动加序号</template>
            </p>
          </div>
          <div>
            <label class="label">分类</label>
            <el-select
              v-model="form.categoryId"
              placeholder="未分类"
              clearable
              filterable
              :disabled="blocked"
              class="w-full"
            >
              <el-option
                v-for="opt in categoryOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
              分类由管理员维护，共 {{ categories.length }} 个
            </p>
          </div>
        </div>

        <div>
          <label class="label">标签</label>
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            :disabled="blocked"
            placeholder="输入后回车即可新建标签"
            class="w-full"
          >
            <el-option v-for="name in tagNames" :key="name" :label="name" :value="name" />
          </el-select>
          <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
            标签不受限制，写不存在的名字会自动创建
          </p>
        </div>

        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <label class="label mb-0">摘要</label>
            <button
              type="button"
              :disabled="blocked || !form.content"
              class="cursor-pointer text-xs text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-brand-400"
              @click="generateSummary"
            >
              从正文生成
            </button>
          </div>
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            :disabled="blocked"
            placeholder="留空则自动截取正文前 200 字"
          />
        </div>

        <div>
          <label class="label">正文</label>
          <ConsoleMarkdownField
            v-model="form.content"
            :disabled="blocked"
            :min-height="560"
          />
          <p v-if="errors.content" class="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
            {{ errors.content }}
          </p>
        </div>
      </div>

      <!-- ------------------------------------------------ 右侧设置 -->
      <aside class="space-y-4">
        <div class="card space-y-4 p-4 xl:sticky xl:top-20">
          <!-- 状态 -->
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">状态</span>
            <div class="flex items-center gap-2">
              <el-tag v-if="isScheduled" type="warning" size="small" effect="light" round>
                定时发布
              </el-tag>
              <ConsoleStatusTag v-if="current" :status="current.status" kind="article" />
              <span v-else class="text-xs text-slate-400">未保存</span>
            </div>
          </div>

          <el-alert
            v-if="isScheduled && current?.publishedAt"
            type="info"
            :closable="false"
            :title="`将于 ${formatDateTime(current.publishedAt)} 自动上线`"
          />

          <!-- 操作 -->
          <div class="space-y-2">
            <el-button
              v-if="!isPublished"
              type="primary"
              class="w-full"
              :loading="saving"
              :disabled="blocked"
              @click="save('published')"
            >
              {{ scheduledAt ? '定时发布' : '立即发布' }}
            </el-button>
            <el-button
              v-else
              type="primary"
              class="w-full"
              :loading="saving"
              :disabled="blocked"
              @click="save('published')"
            >
              保存并更新
            </el-button>

            <el-button
              class="w-full !ml-0"
              :loading="saving"
              :disabled="blocked"
              @click="save('draft')"
            >
              存为草稿
            </el-button>

            <el-button
              v-if="isPublished"
              class="w-full !ml-0"
              :disabled="blocked"
              @click="save('draft')"
            >
              撤回为草稿
            </el-button>
          </div>

          <div class="border-t border-slate-100 pt-4 dark:border-slate-800">
            <label class="label">定时发布</label>
            <input
              v-model="scheduledAt"
              type="datetime-local"
              :disabled="blocked"
              class="field"
            />
            <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
              留空就是立即发布。前台按「发布时间 ≤ 现在」过滤，到点自动可见。
            </p>
          </div>

          <div class="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <div>
              <p class="text-sm font-medium text-slate-700 dark:text-slate-200">置顶</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">置顶文章排在列表最前</p>
            </div>
            <el-switch v-model="form.isTop" :disabled="blocked" />
          </div>

          <!-- 封面 -->
          <div class="border-t border-slate-100 pt-4 dark:border-slate-800">
            <label class="label">封面图</label>
            <div
              v-if="form.coverUrl"
              class="mb-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <img :src="form.coverUrl" alt="封面预览" class="aspect-video w-full object-cover" />
            </div>
            <div class="flex gap-2">
              <el-button size="small" :loading="coverUploading" :disabled="blocked" @click="pickCover">
                {{ form.coverUrl ? '更换' : '上传封面' }}
              </el-button>
              <el-button
                v-if="form.coverUrl"
                size="small"
                :disabled="blocked"
                @click="form.coverUrl = ''"
              >
                移除
              </el-button>
            </div>
            <el-input
              v-model="form.coverUrl"
              size="small"
              class="mt-2"
              placeholder="或直接填图片地址"
              :disabled="blocked"
            />
            <input
              ref="coverInput"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              class="hidden"
              @change="onCoverPicked"
            />
          </div>

          <!-- 数据 -->
          <dl
            v-if="current"
            class="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center dark:border-slate-800"
          >
            <div>
              <dt class="text-xs text-slate-400 dark:text-slate-500">阅读</dt>
              <dd class="mt-0.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {{ current.viewCount }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400 dark:text-slate-500">点赞</dt>
              <dd class="mt-0.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {{ current.likeCount }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400 dark:text-slate-500">评论</dt>
              <dd class="mt-0.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {{ current.commentCount }}
              </dd>
            </div>
          </dl>

          <p
            v-if="dirty"
            class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            有未保存的修改
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
