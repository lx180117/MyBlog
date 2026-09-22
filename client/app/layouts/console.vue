<script setup lang="ts">
/**
 * 作者工作台 / 管理后台的共用布局。
 *
 * 关于 Element Plus 的样式加载方式（见 nuxt.config.ts 的 importStyle: false）：
 * 这两行 import 是本布局独有的，Vite 会把 element-plus 的 CSS 切进
 * console 布局所在的异步 chunk。前台页面完全不加载后台样式 ——
 * 默认配置（importStyle: 'css'）会把它塞进全站公共样式表，前台读者白下 45KB。
 */
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const { siteName } = useSettings();

const sidebarOpen = ref(false);

interface NavItem {
  to: string;
  label: string;
  /** 精确匹配（用于 /admin 这类同时是父级的入口） */
  exact?: boolean;
}

/** 作者能做的事 */
const authorNav: NavItem[] = [
  { to: '/dashboard', label: '我的文章', exact: true },
  { to: '/dashboard/comments', label: '评论管理' },
  { to: '/dashboard/profile', label: '个人资料' },
];

/** 只有管理员能看到的 */
const adminNav: NavItem[] = [
  { to: '/admin', label: '仪表盘', exact: true },
  { to: '/admin/articles', label: '全部文章' },
  { to: '/admin/comments', label: '评论审核' },
  { to: '/admin/users', label: '用户管理' },
  { to: '/admin/categories', label: '分类管理' },
  { to: '/admin/tags', label: '标签管理' },
  { to: '/admin/settings', label: '站点设置' },
];

const isAdmin = computed(() => auth.state.value.user?.role === 'admin');
const pendingUser = computed(() => auth.state.value.user?.status === 'pending');

/**
 * 顶栏标题按当前路由推导，而不是让每个页面传进来。
 * 这个布局的具名插槽没法由页面直接填充（页面渲染的是默认插槽），
 * 而把标题抄在每个页面顶部的 h1 里迟早会漏 —— 于是用一次最长前缀匹配。
 * 取最长前缀是为了让 /admin/articles 命中「全部文章」而不是它的父级 /admin。
 */
const pageTitle = computed(() => {
  const all = [...authorNav, ...adminNav];
  let matched: NavItem | null = null;
  for (const item of all) {
    if (route.path === item.to || route.path.startsWith(`${item.to}/`)) {
      if (!matched || item.to.length > matched.to.length) matched = item;
    }
  }
  return matched?.label ?? '工作台';
});

function isActive(item: NavItem) {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to);
}

router.afterEach(() => {
  sidebarOpen.value = false;
});

async function onLogout() {
  await auth.logout();
  await router.push('/login');
}

const linkBase =
  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition';
const linkOn = 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300';
const linkOff =
  'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';
</script>

<template>
  <div class="flex min-h-screen bg-slate-50 dark:bg-slate-950">
    <!-- 侧边栏 -->
    <aside
      class="fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-slate-200 bg-white transition-transform duration-200
             lg:static lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900"
      :class="sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:shadow-none'"
    >
      <div class="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <span class="flex size-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
            {{ siteName.slice(0, 1) }}
          </span>
          <span class="max-w-32 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {{ siteName }}
          </span>
        </NuxtLink>
        <button
          type="button"
          class="cursor-pointer text-slate-400 lg:hidden"
          aria-label="关闭菜单"
          @click="sidebarOpen = false"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <nav class="flex flex-col gap-0.5 overflow-y-auto p-3">
        <p class="px-3 pt-1 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          创作
        </p>
        <NuxtLink
          v-for="item in authorNav"
          :key="item.to"
          :to="item.to"
          :class="[linkBase, isActive(item) ? linkOn : linkOff]"
        >
          {{ item.label }}
        </NuxtLink>

        <template v-if="isAdmin">
          <p class="px-3 pt-5 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            管理
          </p>
          <NuxtLink
            v-for="item in adminNav"
            :key="item.to"
            :to="item.to"
            :class="[linkBase, isActive(item) ? linkOn : linkOff]"
          >
            {{ item.label }}
          </NuxtLink>
        </template>

        <div class="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <NuxtLink to="/" :class="[linkBase, linkOff]">← 回到前台</NuxtLink>
        </div>
      </nav>
    </aside>

    <!-- 移动端遮罩 -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
      @click="sidebarOpen = false"
    />

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 顶栏 -->
      <header
        class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur
               dark:border-slate-800 dark:bg-slate-900/90"
      >
        <button
          type="button"
          class="cursor-pointer text-slate-500 lg:hidden dark:text-slate-400"
          aria-label="打开菜单"
          @click="sidebarOpen = true"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <h1 class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          <slot name="title">{{ pageTitle }}</slot>
        </h1>

        <div class="ml-auto flex items-center gap-2">
          <ClientOnly>
            <SiteThemeToggle />
            <template #fallback><div class="size-9" /></template>
          </ClientOnly>

          <NuxtLink
            v-if="auth.canPublish.value"
            to="/dashboard/articles/new"
            class="btn-primary btn-sm"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            写文章
          </NuxtLink>

          <ClientOnly>
            <SiteUserMenu />
            <template #fallback><div class="h-8 w-8" /></template>
          </ClientOnly>
        </div>
      </header>

      <!-- 未激活账号的醒目提示：不拦住使用，但必须让作者知道为什么发不了文 -->
      <div
        v-if="pendingUser"
        class="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
      >
        你的账号还在等待管理员审核。期间可以写草稿、完善资料，但暂时无法发布文章。
      </div>

      <main class="min-w-0 flex-1 p-4 sm:p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
