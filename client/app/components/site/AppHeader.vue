<script setup lang="ts">
/**
 * 站点顶栏。
 *
 * 两个必须注意的点：
 *
 * ① 登录态相关的那一块包在 <ClientOnly> 里。
 *    公开页面是 SSR 渲染的，服务端不知道读者登录与否，会输出「登录 / 注册」；
 *    客户端恢复会话后变成头像菜单 —— 两边 DOM 不一致，Vue 会判定 hydration
 *    mismatch 并把整块丢弃重建。包一层 ClientOnly 就变成「预期内的差异」，
 *    占位内容也由我们控制，不会闪。
 *
 * ② 搜索走 /search?q=... 而不是页内下拉建议。
 *    建议列表要额外接口与防抖逻辑，而 v1 的搜索是数据库全文检索，
 *    直接跳结果页更简单也更好被收录（结果页有自己的 URL 和 title）。
 */
const { siteName, siteDescription, registerEnabled, load } = useSettings();
const auth = useAuth();
const router = useRouter();
const route = useRoute();

await load();

const keyword = ref('');
const mobileOpen = ref(false);
const mobileSearchOpen = ref(false);

// 从搜索页返回时把关键词回填，用户接着改比重新输一遍省事
watchEffect(() => {
  if (route.path === '/search') {
    keyword.value = String(route.query.q ?? '');
  }
});

const navItems = [
  { to: '/', label: '首页' },
  { to: '/archives', label: '归档' },
  { to: '/about', label: '关于' },
];

function submitSearch() {
  const q = keyword.value.trim();
  if (!q) return;
  mobileSearchOpen.value = false;
  mobileOpen.value = false;
  router.push({ path: '/search', query: { q } });
}

// 路由变化时收起移动端菜单，否则点完链接面板还盖在页面上
router.afterEach(() => {
  mobileOpen.value = false;
  mobileSearchOpen.value = false;
});

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to));
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md
           dark:border-slate-800/80 dark:bg-slate-950/85"
  >
    <div class="container-page flex h-16 items-center gap-3">
      <!-- 站点标识 -->
      <NuxtLink to="/" class="group flex shrink-0 items-center gap-2.5" :title="siteDescription">
        <span
          class="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white
                 transition group-hover:bg-brand-700"
        >
          {{ siteName.slice(0, 1) }}
        </span>
        <span class="max-w-[10rem] truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          {{ siteName }}
        </span>
      </NuxtLink>

      <!-- 桌面导航 -->
      <nav class="ml-3 hidden items-center gap-0.5 md:flex">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
          :class="
            isActive(item.to)
              ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
          "
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-1.5">
        <!-- 桌面搜索框 -->
        <form class="relative hidden lg:block" role="search" @submit.prevent="submitSearch">
          <svg
            class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索文章"
            aria-label="搜索文章"
            class="w-48 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8.5 text-sm
                   text-slate-900 outline-none transition placeholder:text-slate-400
                   focus:w-60 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
                   dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
          />
        </form>

        <!-- 移动端搜索按钮 -->
        <button
          type="button"
          class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition
                 hover:bg-slate-100 hover:text-slate-900 lg:hidden
                 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          aria-label="搜索"
          @click="mobileSearchOpen = !mobileSearchOpen"
        >
          <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>

        <ClientOnly>
          <SiteThemeToggle />
          <!-- 占位高度与按钮一致，避免恢复登录态时顶栏跳动 -->
          <template #fallback>
            <div class="size-9" />
          </template>
        </ClientOnly>

        <ClientOnly>
          <SiteUserMenu v-if="auth.isLoggedIn.value" />
          <div v-else class="flex items-center gap-0.5">
            <NuxtLink
              to="/login"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition
                     hover:bg-slate-100 hover:text-slate-900
                     dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              登录
            </NuxtLink>
            <NuxtLink v-if="registerEnabled" to="/register" class="btn-primary btn-sm ml-1">
              注册
            </NuxtLink>
          </div>
          <template #fallback>
            <div class="h-8 w-24" />
          </template>
        </ClientOnly>

        <!-- 移动端菜单按钮 -->
        <button
          type="button"
          class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition
                 hover:bg-slate-100 hover:text-slate-900 md:hidden
                 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :aria-expanded="mobileOpen"
          aria-label="打开菜单"
          @click="mobileOpen = !mobileOpen"
        >
          <svg v-if="!mobileOpen" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <svg v-else class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 移动端搜索 -->
    <div v-if="mobileSearchOpen" class="container-page pb-3 lg:hidden">
      <form role="search" @submit.prevent="submitSearch">
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索文章…"
          aria-label="搜索文章"
          class="field"
        />
      </form>
    </div>

    <!-- 移动端导航 -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <nav
        v-if="mobileOpen"
        class="border-t border-slate-200 bg-white px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-950"
      >
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="block rounded-lg px-3 py-2.5 text-sm font-medium transition"
          :class="
            isActive(item.to)
              ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-400'
          "
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </Transition>
  </header>
</template>
