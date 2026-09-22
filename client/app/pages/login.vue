<script setup lang="ts">
/**
 * 登录页。
 *
 * 注意 routeRules 里给 /login 设了 `ssr: false`：
 * 登录后要立刻按身份跳转（管理员去后台、作者去工作台），
 * 服务端渲染时拿不到 token，会先渲染出未登录视图再被客户端覆盖，
 * 白闪一下还会让 redirect 判断走错分支。少这一次 SSR 完全不亏。
 */
definePageMeta({ layout: 'blank' });

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { registerEnabled, load } = useSettings();

await load();

const form = reactive({ account: '', password: '' });
const submitting = ref(false);
const errorText = ref('');

/** 登录成功后去哪儿：优先回跳转前那一页，其次按角色决定 */
function defaultTarget(role: string) {
  const redirect = route.query.redirect;
  if (typeof redirect === 'string' && redirect.startsWith('/')) return redirect;
  return role === 'admin' ? '/admin' : '/dashboard';
}

async function submit() {
  errorText.value = '';
  if (!form.account.trim() || !form.password) {
    errorText.value = '请填写账号与密码';
    return;
  }

  submitting.value = true;
  try {
    const user = await auth.login({
      account: form.account.trim(),
      password: form.password,
    });
    await router.push(defaultTarget(user.role));
  } catch (e) {
    errorText.value = (e as Error).message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="card p-7">
    <h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">登录</h1>
    <p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
      用用户名或邮箱登录。
    </p>

    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <div>
        <label for="account" class="label">用户名或邮箱</label>
        <input
          id="account"
          v-model="form.account"
          class="field"
          autocomplete="username"
          placeholder="admin 或 admin@example.com"
          required
        />
      </div>

      <div>
        <label for="password" class="label">密码</label>
        <input
          id="password"
          v-model="form.password"
          type="password"
          class="field"
          autocomplete="current-password"
          placeholder="••••••••"
          required
        />
      </div>

      <p
        v-if="errorText"
        class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
      >
        {{ errorText }}
      </p>

      <button type="submit" class="btn-primary w-full" :disabled="submitting">
        {{ submitting ? '登录中…' : '登录' }}
      </button>
    </form>

    <div class="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        还没有账号？
        <template v-if="registerEnabled">
          <NuxtLink to="/register" class="font-medium text-brand-600 hover:underline dark:text-brand-400">
            注册一个
          </NuxtLink>
        </template>
        <template v-else>
          <span class="text-slate-400">本站当前已关闭自助注册，请联系管理员开通。</span>
        </template>
      </p>
      <p class="mt-2 text-xs text-slate-400">
        忘记密码？v1 不提供邮件找回，请联系管理员在后台重置。
      </p>
    </div>
  </div>
</template>
