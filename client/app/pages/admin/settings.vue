<script setup lang="ts">
import type { SiteSettingsValuesDto, SocialLinkDto, UpdateSettingsResultDto } from '~/types/api';
import type { SettingsShape } from '~/types/domain';
import { confirmDanger, errorText, notifyError, notifyOk } from '~/utils/dialog';

/**
 * 站点设置。
 *
 * 后端把配置存成键值对（`site_settings` 表），值**统一是字符串**：
 * 布尔存 'true'/'false'，数字存 '12'，数组/对象存 JSON 字符串。
 * 所以这一页的本地状态也用字符串（SettingsShape），只在渲染控件时做转换 ——
 * 如果在本地把它拆成 boolean/number，保存时还得再拼回字符串，
 * 而「比较哪些项被改了」这件事就会因为类型转换变得不准确。
 *
 * 白名单：后端只接受 ALLOWED_KEYS 里的键，其余静默忽略。这里的字段与它一一对应。
 */
definePageMeta({ layout: 'console', middleware: ['admin'] });

const api = useApi();
const siteSettings = useSettings();

const DEFAULTS: SettingsShape = {
  site_name: '',
  site_description: '',
  site_logo: '',
  site_favicon: '',
  icp_number: '',
  per_page: '12',
  register_enabled: 'false',
  register_need_approve: 'true',
  comment_enabled: 'true',
  comment_need_approve: 'true',
  comment_allow_guest: 'true',
  sensitive_words: '',
  social_links: '[]',
};

const KEYS = Object.keys(DEFAULTS) as (keyof SettingsShape)[];

const form = reactive<SettingsShape>({ ...DEFAULTS });
const original = ref<SettingsShape>({ ...DEFAULTS });
const descriptions = ref<Record<string, string>>({});
const loading = ref(false);
const saving = ref(false);
const error = ref('');

/* ---------------------------------------------- 结构化字段（开关 / 列表） */

type BoolKey =
  | 'register_enabled'
  | 'register_need_approve'
  | 'comment_enabled'
  | 'comment_need_approve'
  | 'comment_allow_guest';

/** 用一个可写 computed 把「字符串 ↔ 布尔」的转换收在一处，模板里就能直接 v-model */
function boolField(key: BoolKey) {
  return computed<boolean>({
    get: () => form[key] === 'true',
    set: (value) => {
      form[key] = value ? 'true' : 'false';
    },
  });
}

// 必须解构到顶层变量：`flags.xxx` 这种嵌套在普通对象里的 ref，
// 模板不会自动解包，v-model 拿到的会是 ref 对象本身
const flagRegisterEnabled = boolField('register_enabled');
const flagRegisterNeedApprove = boolField('register_need_approve');
const flagCommentEnabled = boolField('comment_enabled');
const flagCommentNeedApprove = boolField('comment_need_approve');
const flagCommentAllowGuest = boolField('comment_allow_guest');

const socialLinks = ref<SocialLinkDto[]>([]);
const sensitiveWords = ref<string[]>([]);

/**
 * 每页条数单独用 number 保存。
 * `el-input-number` 的 v-model 是 number，而 form 里全是字符串 ——
 * 直接绑 form.per_page 会让 el-input-number 把数字写进一个 string 字段（类型不符），
 * 所以另开一个 ref，双向同步。
 */
const perPage = ref(12);
watch(perPage, (value) => {
  form.per_page = String(value || 12);
});

function serializeSocial(): string {
  // 只保存填全了的行，免得留下 {name:'', url:''} 这种空记录
  const cleaned = socialLinks.value
    .map((l) => ({ name: l.name.trim(), url: l.url.trim(), icon: l.icon?.trim() || undefined }))
    .filter((l) => l.name && l.url);
  return JSON.stringify(cleaned);
}

function parseSocial(raw: string) {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) {
      socialLinks.value = [];
      return;
    }
    socialLinks.value = parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        name: String(item.name ?? ''),
        url: String(item.url ?? ''),
        icon: item.icon ? String(item.icon) : undefined,
      }));
  } catch {
    // 配置被写坏时不要整页崩掉，给空数组让管理员能重填
    socialLinks.value = [];
  }
}

function parseWords(raw: string) {
  sensitiveWords.value = raw
    .split(/[,，\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
}

// 结构化编辑器改动后立刻回写字符串字段，
// 这样「哪些项被改了」的比对只需要看 form 一处
watch(
  socialLinks,
  () => {
    form.social_links = serializeSocial();
  },
  { deep: true },
);
watch(
  sensitiveWords,
  () => {
    form.sensitive_words = sensitiveWords.value.join(',');
  },
  { deep: true },
);

function addSocial() {
  socialLinks.value.push({ name: '', url: '' });
}

function removeSocial(index: number) {
  socialLinks.value.splice(index, 1);
}

/* ------------------------------------------------------------ 加载 / 保存 */

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get<SiteSettingsValuesDto>('/admin/settings');
    const values = res.values ?? {};

    const next: SettingsShape = { ...DEFAULTS };
    for (const key of KEYS) {
      const raw = values[key];
      if (raw !== undefined && raw !== null) next[key] = String(raw);
    }

    Object.assign(form, next);
    parseSocial(next.social_links);
    parseWords(next.sensitive_words);
    perPage.value = Number(next.per_page) || 12;
    // 归一化后立刻回写：watch 是异步 flush 的，不显式写一遍的话
    // 「基线快照」会拿到未归一化的旧值，页面一打开就显示「有未保存的修改」
    form.per_page = String(perPage.value);

    // 归一化：把 social_links / sensitive_words 转成编辑器再序列化出来的形式，
    // 否则原始 JSON 的空格差异会让页面一打开就显示「有未保存的修改」
    form.social_links = serializeSocial();
    form.sensitive_words = sensitiveWords.value.join(',');

    original.value = { ...form };
    descriptions.value = Object.fromEntries(
      Object.entries(res.descriptions ?? {}).map(([k, v]) => [k, String(v ?? '')]),
    );
  } catch (e) {
    error.value = errorText(e, '配置加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const dirty = computed(() => KEYS.some((key) => form[key] !== original.value[key]));

function desc(key: keyof SettingsShape): string {
  return descriptions.value[key] ?? '';
}

async function save() {
  // 先同步 el-input-number 的值（它的 watch 是异步的，点保存时可能还没 flush）
  form.per_page = String(perPage.value);

  const value = Number(form.per_page);
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    notifyError('每页条数必须是 1–50 之间的整数（后端分页上限是 50）');
    return;
  }
  if (!form.site_name.trim()) {
    notifyError('站点名称不能为空');
    return;
  }

  // 只提交真正改动过的键：后端会返回实际更新了哪些，
  // 一起提交全部键的话，「已更新 13 项配置」这种提示就失去意义了
  const values: Record<string, string> = {};
  for (const key of KEYS) {
    if (form[key] !== original.value[key]) values[key] = form[key];
  }

  if (!Object.keys(values).length) {
    notifyOk('没有需要保存的改动');
    return;
  }

  saving.value = true;
  try {
    const res = await api.patch<UpdateSettingsResultDto>('/admin/settings', { values });
    notifyOk(res?.message ?? '已保存');
    original.value = { ...form };

    // 前台的站点名、备案号、每页条数来自 useSettings 的全局缓存。
    // 清掉再拉一次，否则改完站点名、前台页头还是旧的（要手动刷新才变）
    siteSettings.settings.value = null;
    await siteSettings.load();
  } catch (e) {
    notifyError(errorText(e, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function revert() {
  const ok = await confirmDanger('放弃所有未保存的修改？', {
    title: '撤销修改',
    confirmText: '撤销',
  });
  if (!ok) return;
  Object.assign(form, original.value);
  parseSocial(original.value.social_links);
  parseWords(original.value.sensitive_words);
  perPage.value = Number(original.value.per_page) || 12;
  form.per_page = String(perPage.value);
}
</script>

<template>
  <div>
    <ConsolePageHeader title="站点设置" description="改完立即生效（后端会立刻失效配置缓存）。">
      <template #actions>
        <span v-if="dirty" class="text-xs text-amber-600 dark:text-amber-400">有未保存的修改</span>
        <el-button v-if="dirty" size="small" @click="revert">撤销</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="save">保存</el-button>
      </template>
    </ConsolePageHeader>

    <el-alert v-if="error" type="error" show-icon :closable="false" class="mb-4" :title="error" />

    <div v-if="loading" class="space-y-4">
      <div class="skeleton h-56" />
      <div class="skeleton h-40" />
    </div>

    <div v-else class="grid gap-5 xl:grid-cols-2">
      <!-- 站点信息 -->
      <section class="card p-5">
        <h3 class="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">站点信息</h3>
        <div class="space-y-4">
          <div>
            <label class="label">站点名称</label>
            <el-input v-model="form.site_name" maxlength="50" placeholder="我的博客" />
            <p v-if="desc('site_name')" class="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {{ desc('site_name') }}
            </p>
          </div>
          <div>
            <label class="label">站点描述</label>
            <el-input
              v-model="form.site_description"
              type="textarea"
              :rows="2"
              maxlength="200"
              show-word-limit
              placeholder="会用于首页 SEO description"
            />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label">Logo 地址</label>
              <el-input v-model="form.site_logo" placeholder="留空用站点名首字" />
            </div>
            <div>
              <label class="label">favicon 地址</label>
              <el-input v-model="form.site_favicon" placeholder="/favicon.svg" />
            </div>
          </div>
          <div>
            <label class="label">ICP 备案号</label>
            <el-input v-model="form.icp_number" placeholder="留空则页脚不显示备案信息" />
          </div>
        </div>
      </section>

      <!-- 内容与交互 -->
      <div class="space-y-5">
        <section class="card p-5">
          <h3 class="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">内容与分页</h3>
          <div>
            <label class="label">列表每页条数</label>
            <el-input-number v-model="perPage" :min="1" :max="50" />
            <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
              影响前台所有列表页的默认分页大小（1–50）
            </p>
          </div>
        </section>

        <section class="card p-5">
          <h3 class="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">注册</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-slate-700 dark:text-slate-200">开放自助注册</p>
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  关掉之后只有管理员能开账号
                </p>
              </div>
              <el-switch v-model="flagRegisterEnabled" />
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-slate-700 dark:text-slate-200">注册后需要审核</p>
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  开启时新账号是「待审核」状态，通过后才能发文
                </p>
              </div>
              <el-switch v-model="flagRegisterNeedApprove" />
            </div>
          </div>
        </section>

        <section class="card p-5">
          <h3 class="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">评论</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-slate-700 dark:text-slate-200">开启评论</p>
                <p class="text-xs text-slate-400 dark:text-slate-500">关掉后前台不再显示评论框</p>
              </div>
              <el-switch v-model="flagCommentEnabled" />
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-slate-700 dark:text-slate-200">新评论需要审核</p>
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  开启后评论先进待审队列，通过才公开
                </p>
              </div>
              <el-switch v-model="flagCommentNeedApprove" />
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-slate-700 dark:text-slate-200">允许游客评论</p>
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  关闭后必须登录才能评论
                </p>
              </div>
              <el-switch v-model="flagCommentAllowGuest" />
            </div>
          </div>
        </section>
      </div>

      <!-- 敏感词 -->
      <section class="card p-5">
        <h3 class="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">敏感词</h3>
        <p class="mb-4 text-xs text-slate-400 dark:text-slate-500">
          提交评论时命中这些词会被拦下并提示。输入后回车即可添加。
        </p>
        <el-select
          v-model="sensitiveWords"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入敏感词后回车"
          class="w-full"
        >
          <el-option v-for="word in sensitiveWords" :key="word" :label="word" :value="word" />
        </el-select>
        <p class="mt-2 text-xs text-slate-400 dark:text-slate-500">
          当前 {{ sensitiveWords.length }} 个词
        </p>
      </section>

      <!-- 社交链接 -->
      <section class="card p-5">
        <h3 class="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">社交链接</h3>
        <p class="mb-4 text-xs text-slate-400 dark:text-slate-500">
          显示在前台页脚。名称与链接都填了才会保存。
        </p>

        <div v-if="socialLinks.length" class="mb-3 space-y-2">
          <div v-for="(link, index) in socialLinks" :key="index" class="flex items-center gap-2">
            <el-input v-model="link.name" placeholder="名称" class="w-28" />
            <el-input v-model="link.url" placeholder="https://" class="flex-1" />
            <el-button link type="danger" @click="removeSocial(index)">删除</el-button>
          </div>
        </div>
        <p v-else class="mb-3 text-xs text-slate-400 dark:text-slate-500">还没有社交链接</p>

        <el-button size="small" @click="addSocial">添加一行</el-button>
      </section>
    </div>
  </div>
</template>
