<script setup lang="ts">
/**
 * 已登录用户的头像下拉菜单。
 * 只在 <ClientOnly> 里使用 —— 登录态在 SSR 时不可知。
 *
 * 样式说明：全项目统一**不在 SFC 的 <style> 块里用 @apply**。
 * Tailwind v4 对 SFC style 块里的 `dark:` 变体解析依赖 @custom-variant 的作用域，
 * 跨文件不保证生效；工具类写在模板里则永远是对的。
 * 重复的类名抽成 JS 常量（见下方 itemBase），比复制粘贴好维护。
 */
const auth = useAuth();
const router = useRouter();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const busy = ref(false);

useClickOutside(root, () => {
  open.value = false;
});

// 路由一变就收起，否则跳转后菜单还挂在那儿
router.afterEach(() => {
  open.value = false;
});

const user = computed(() => auth.state.value.user);

const itemBase =
  'flex w-full items-center px-3.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50 ' +
  'disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800';

async function onLogout() {
  busy.value = true;
  try {
    await auth.logout();
    open.value = false;
    await router.push('/');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex cursor-pointer items-center gap-2 rounded-full py-1 pr-2 pl-1 transition
             hover:bg-slate-100 dark:hover:bg-slate-800"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <SiteAuthorAvatar
        :src="user?.avatarUrl"
        :name="user?.nickname"
        :seed="user?.username"
        :size="28"
      />
      <span class="hidden max-w-24 truncate text-sm font-medium text-slate-700 sm:block dark:text-slate-300">
        {{ user?.nickname }}
      </span>
      <svg
        class="size-3.5 text-slate-400 transition"
        :class="open ? 'rotate-180' : ''"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-75 ease-in"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-200/70
               dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
        role="menu"
      >
        <div class="border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
          <p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {{ user?.nickname }}
          </p>
          <p class="truncate text-xs text-slate-500">@{{ user?.username }}</p>
          <!-- 待审核状态要显眼提示，否则用户会一直等「为什么发不了文章」 -->
          <p
            v-if="user?.status === 'pending'"
            class="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          >
            账号待管理员审核，暂不能发文
          </p>
        </div>

        <NuxtLink to="/dashboard" :class="itemBase">我的文章</NuxtLink>
        <NuxtLink to="/dashboard/comments" :class="itemBase">评论管理</NuxtLink>
        <NuxtLink
          v-if="user?.username"
          :to="`/author/${user.username}`"
          :class="itemBase"
        >
          我的主页
        </NuxtLink>
        <NuxtLink to="/dashboard/profile" :class="itemBase">个人资料</NuxtLink>

        <template v-if="auth.isAdmin.value">
          <div class="my-1.5 border-t border-slate-100 dark:border-slate-800" />
          <NuxtLink
            to="/admin"
            :class="`${itemBase} font-medium text-brand-600 dark:text-brand-400`"
          >
            管理后台
          </NuxtLink>
        </template>

        <div class="my-1.5 border-t border-slate-100 dark:border-slate-800" />
        <button
          type="button"
          :class="`${itemBase} cursor-pointer text-left text-rose-600 dark:text-rose-400`"
          :disabled="busy"
          role="menuitem"
          @click="onLogout"
        >
          {{ busy ? '正在退出…' : '退出登录' }}
        </button>
      </div>
    </Transition>
  </div>
</template>
