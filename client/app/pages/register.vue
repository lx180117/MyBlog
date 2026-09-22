<script setup lang="ts">
/**
 * 注册页（FR-1.1 / FR-1.2）。
 *
 * 两处前端必须和后端规则保持一致，否则用户要提交才知道错：
 *  1. 用户名规则 `^[a-z0-9][a-z0-9_-]{2,49}$` —— 它会**直接成为作者主页地址**
 *     `/author/{username}`，所以只允许小写字母数字与短横线/下划线。
 *     这里在输入时就转小写，并给出即时提示。
 *  2. 密码至少 8 位且同时含字母与数字。
 *
 * 注册成功后账号是 `pending`（能登录、能写草稿，但不能发布），
 * 这一点必须在成功页写清楚 —— 否则用户会以为网站坏了。
 */
definePageMeta({ layout: 'blank' });

const auth = useAuth();
const { registerEnabled, registerNeedApprove, load } = useSettings();

await load();

const form = reactive({
  username: '',
  nickname: '',
  email: '',
  password: '',
  confirm: '',
});

const submitting = ref(false);
const errorText = ref('');
const done = ref(false);

/** 用户名输入时自动小写并剔除非法字符，比提交后报错友好 */
function onUsernameInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const cleaned = el.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  form.username = cleaned;
  el.value = cleaned;
}

const usernameOk = computed(() => /^[a-z0-9][a-z0-9_-]{2,49}$/.test(form.username));
const passwordOk = computed(
  () => form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /\d/.test(form.password),
);
const confirmOk = computed(() => form.confirm.length > 0 && form.confirm === form.password);

const canSubmit = computed(
  () =>
    usernameOk.value &&
    passwordOk.value &&
    confirmOk.value &&
    form.nickname.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()),
);

async function submit() {
  errorText.value = '';
  if (!canSubmit.value) return;

  submitting.value = true;
  try {
    await auth.register({
      username: form.username,
      nickname: form.nickname.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    done.value = true;
  } catch (e) {
    errorText.value = (e as Error).message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="card p-7">
    <!-- 注册成功 -->
    <template v-if="done">
      <div class="flex size-11 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/50">
        <svg class="size-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="m5 13 4 4L19 7" />
        </svg>
      </div>

      <h1 class="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">注册成功</h1>

      <p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <template v-if="registerNeedApprove">
          你的账号已创建，现在是<strong class="font-medium text-amber-600 dark:text-amber-400">待审核</strong>状态。
          管理员通过后就能发布文章 —— 期间你可以先登录，把草稿写好。
        </template>
        <template v-else>
          你的账号已经可以使用了，去写第一篇文章吧。
        </template>
      </p>

      <div class="mt-6 flex flex-wrap gap-3">
        <NuxtLink to="/dashboard/articles/new" class="btn-primary">开始写文章</NuxtLink>
        <NuxtLink to="/dashboard" class="btn-ghost">进入工作台</NuxtLink>
      </div>
    </template>

    <!-- 注册表单 -->
    <template v-else-if="registerEnabled">
      <h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">注册账号</h1>
      <p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
        注册后即可登录写作<template v-if="registerNeedApprove">，但需要管理员审核通过才能发布</template>。
      </p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <div>
          <label for="username" class="label">用户名</label>
          <input
            id="username"
            :value="form.username"
            class="field font-mono"
            placeholder="zhangsan"
            autocomplete="username"
            maxlength="50"
            @input="onUsernameInput"
          />
          <p class="mt-1.5 text-xs" :class="form.username && !usernameOk ? 'text-amber-600' : 'text-slate-400'">
            只能用小写字母、数字、短横线和下划线，3–50 位。
            <template v-if="form.username && usernameOk">
              你的主页地址是
              <span class="font-mono text-slate-500">/author/{{ form.username }}</span>
            </template>
          </p>
        </div>

        <div>
          <label for="nickname" class="label">昵称</label>
          <input
            id="nickname"
            v-model="form.nickname"
            class="field"
            placeholder="张三"
            maxlength="50"
          />
          <p class="mt-1.5 text-xs text-slate-400">显示在文章署名与评论里，可以用中文。</p>
        </div>

        <div>
          <label for="email" class="label">邮箱</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            class="field"
            placeholder="zhangsan@example.com"
            autocomplete="email"
          />
          <p class="mt-1.5 text-xs text-slate-400">用于登录，不会公开显示。</p>
        </div>

        <div>
          <label for="password" class="label">密码</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            class="field"
            placeholder="至少 8 位，含字母与数字"
            autocomplete="new-password"
          />
          <p
            v-if="form.password"
            class="mt-1.5 text-xs"
            :class="passwordOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
          >
            {{ passwordOk ? '密码强度符合要求' : '至少 8 位，且同时包含字母和数字' }}
          </p>
        </div>

        <div>
          <label for="confirm" class="label">确认密码</label>
          <input
            id="confirm"
            v-model="form.confirm"
            type="password"
            class="field"
            autocomplete="new-password"
          />
          <p
            v-if="form.confirm && !confirmOk"
            class="mt-1.5 text-xs text-amber-600 dark:text-amber-400"
          >
            两次输入的密码不一致
          </p>
        </div>

        <p
          v-if="errorText"
          class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {{ errorText }}
        </p>

        <button type="submit" class="btn-primary w-full" :disabled="submitting || !canSubmit">
          {{ submitting ? '注册中…' : '注册' }}
        </button>
      </form>

      <p class="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        已经有账号了？
        <NuxtLink to="/login" class="font-medium text-brand-600 hover:underline dark:text-brand-400">
          去登录
        </NuxtLink>
      </p>
    </template>

    <!-- 站点关闭了自助注册 -->
    <template v-else>
      <h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">暂不开放注册</h1>
      <p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        本站当前关闭了自助注册。想加入写作，请联系站长由管理员为你开通账号。
      </p>
      <div class="mt-6">
        <NuxtLink to="/login" class="btn-primary">返回登录</NuxtLink>
      </div>
    </template>
  </div>
</template>
