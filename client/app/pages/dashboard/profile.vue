<script setup lang="ts">
import type { UserProfileDto } from '~/types/api';
import { USER_ROLE_META, USER_STATUS_META } from '~/types/domain';
import { errorText, notifyError, notifyOk } from '~/utils/dialog';

definePageMeta({ layout: 'console', middleware: ['auth'] });

const auth = useAuth();
const config = useRuntimeConfig();
const { uploading: avatarUploading, pickAndUpload } = useImageUpload();

const user = computed(() => auth.state.value.user);

const publicUrl = computed(() => {
  if (!user.value) return '';
  return `${String(config.public.siteUrl).replace(/\/$/, '')}/author/${user.value.username}`;
});

/**
 * 角色与状态的展示映射在这里算好再交给模板。
 * 直接在模板里写 USER_STATUS_META[user.status] 会有两个问题：
 * user 可能是 null（要额外做类型收窄），而且索引结果可能是 undefined，
 * 每处引用都要再写一遍 `?? 兜底`。收在 computed 里只写一次。
 */
const roleMeta = computed(() => (user.value ? USER_ROLE_META[user.value.role] : null));
const statusMeta = computed(() => (user.value ? USER_STATUS_META[user.value.status] : null));

/* ------------------------------------------------------------ 资料表单 */

const form = reactive({
  nickname: '',
  email: '',
  avatarUrl: '',
  bio: '',
  website: '',
  github: '',
});

const saving = ref(false);
const avatarInput = ref<HTMLInputElement | null>(null);

function fill(source: UserProfileDto | null | undefined) {
  if (!source) return;
  form.nickname = source.nickname;
  form.email = source.email ?? '';
  form.avatarUrl = source.avatarUrl ?? '';
  form.bio = source.bio ?? '';
  form.website = source.website ?? '';
  form.github = source.github ?? '';
}

onMounted(async () => {
  // 直接进这一页时（刷新）会话可能还没恢复完，先等一下再回填
  if (!user.value) await auth.restore();
  fill(user.value);
});

// 别处改了资料（比如后台管理员操作）时表单跟着走，避免显示陈旧数据
watch(user, (next) => fill(next));

function pickAvatar() {
  avatarInput.value?.click();
}

async function onAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  const res = await pickAndUpload(file, '头像已上传');
  if (res) form.avatarUrl = res.url;
}

async function saveProfile() {
  if (!form.nickname.trim()) {
    notifyError('昵称不能为空');
    return;
  }

  saving.value = true;
  try {
    await auth.updateProfile({
      nickname: form.nickname.trim(),
      email: form.email.trim() || undefined,
      avatarUrl: form.avatarUrl.trim(),
      bio: form.bio.trim(),
      website: form.website.trim(),
      github: form.github.trim(),
    });
    notifyOk('资料已更新');
  } catch (e) {
    notifyError(errorText(e, '保存失败'));
  } finally {
    saving.value = false;
  }
}

/* ------------------------------------------------------------ 修改密码 */

const pwd = reactive({ old: '', next: '', confirm: '' });
const changing = ref(false);

/** 与后端 PasswordService 的强度规则保持一致，先在本地拦一道省一次请求 */
function passwordError(): string {
  if (!pwd.old) return '请输入当前密码';
  if (pwd.next.length < 8) return '新密码至少 8 位';
  if (!/[A-Za-z]/.test(pwd.next) || !/\d/.test(pwd.next)) return '新密码必须同时包含字母和数字';
  if (pwd.next !== pwd.confirm) return '两次输入的新密码不一致';
  return '';
}

async function changePassword() {
  const message = passwordError();
  if (message) {
    notifyError(message);
    return;
  }

  changing.value = true;
  try {
    await auth.changePassword(pwd.old, pwd.next);
    notifyOk('密码已修改');
    pwd.old = '';
    pwd.next = '';
    pwd.confirm = '';
  } catch (e) {
    notifyError(errorText(e, '修改密码失败'));
  } finally {
    changing.value = false;
  }
}
</script>

<template>
  <div>
    <ConsolePageHeader
      title="个人资料"
      description="这些内容会显示在文章作者栏和你的作者主页上。"
    >
      <template #actions>
        <a v-if="publicUrl" :href="publicUrl" target="_blank" rel="noopener" class="btn-ghost btn-sm">
          看我的作者主页
        </a>
      </template>
    </ConsolePageHeader>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <!-- ---------------------------------------------- 基本资料 -->
      <div class="card p-5">
        <h3 class="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">基本资料</h3>

        <div class="mb-5 flex items-center gap-4">
          <SiteAuthorAvatar
            :name="form.nickname || user?.username"
            :src="form.avatarUrl || null"
            :size="64"
          />
          <div>
            <div class="flex gap-2">
              <el-button size="small" :loading="avatarUploading" @click="pickAvatar">
                上传头像
              </el-button>
              <el-button v-if="form.avatarUrl" size="small" @click="form.avatarUrl = ''">
                移除
              </el-button>
            </div>
            <p class="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              jpg / png / gif / webp，建议正方形
            </p>
          </div>
          <input
            ref="avatarInput"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            class="hidden"
            @change="onAvatarPicked"
          />
        </div>

        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label">昵称</label>
              <el-input v-model="form.nickname" maxlength="50" placeholder="展示用的名字" />
            </div>
            <div>
              <label class="label">邮箱</label>
              <el-input v-model="form.email" placeholder="用于接收站内通知" />
              <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
                改邮箱不影响登录，登录名始终是用户名
              </p>
            </div>
          </div>

          <div>
            <label class="label">个人简介</label>
            <el-input
              v-model="form.bio"
              type="textarea"
              :rows="3"
              maxlength="500"
              show-word-limit
              placeholder="一两句话介绍自己，会显示在作者主页"
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label">个人主页</label>
              <el-input v-model="form.website" placeholder="https://" />
            </div>
            <div>
              <label class="label">GitHub</label>
              <el-input v-model="form.github" placeholder="账号或主页地址" />
            </div>
          </div>

          <div class="flex justify-end pt-1">
            <el-button type="primary" :loading="saving" @click="saveProfile">保存资料</el-button>
          </div>
        </div>
      </div>

      <!-- ---------------------------------------------- 账号信息 + 密码 -->
      <aside class="space-y-5">
        <div class="card p-5">
          <h3 class="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">账号</h3>
          <dl class="space-y-2.5 text-sm">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">用户名</dt>
              <dd class="truncate font-mono text-slate-700 dark:text-slate-200">
                {{ user?.username ?? '—' }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">角色</dt>
              <dd>
                <el-tag :type="roleMeta?.tone ?? 'info'" size="small" effect="light" round>
                  {{ roleMeta?.label ?? '—' }}
                </el-tag>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">状态</dt>
              <dd>
                <el-tag :type="statusMeta?.tone ?? 'info'" size="small" effect="light" round>
                  {{ statusMeta?.label ?? '—' }}
                </el-tag>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-slate-500 dark:text-slate-400">注册时间</dt>
              <dd class="text-slate-700 dark:text-slate-200">{{ formatDate(user?.createdAt) }}</dd>
            </div>
          </dl>

          <p
            v-if="!auth.canPublish.value"
            class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            账号还没通过审核，暂时不能发文。
          </p>
          <p
            v-else
            class="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            账号已激活，可以正常写作与发布。
          </p>
        </div>

        <div class="card p-5">
          <h3 class="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">修改密码</h3>
          <div class="space-y-3">
            <el-input v-model="pwd.old" type="password" show-password placeholder="当前密码" />
            <el-input v-model="pwd.next" type="password" show-password placeholder="新密码（至少 8 位，含字母与数字）" />
            <el-input v-model="pwd.confirm" type="password" show-password placeholder="再输一次新密码" />
            <p class="text-xs text-slate-400 dark:text-slate-500">
              修改后其他设备上的登录会失效，需要重新登录。
            </p>
            <el-button class="w-full" :loading="changing" @click="changePassword">
              修改密码
            </el-button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
