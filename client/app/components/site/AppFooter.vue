<script setup lang="ts">
/**
 * 站点页脚。
 *
 * ICP 备案号按 FR-7.x 只在后台配置了才展示 —— 国内未备案站点挂一个假备案号
 * 反而更麻烦，所以默认留空即不渲染。
 */
const { siteName, siteDescription, settings, summary, load, loadSummary, rssUrl } = useSettings();

await Promise.all([load(), loadSummary()]);

const year = new Date().getFullYear();

const socialLinks = computed(() => settings.value?.socialLinks ?? []);
const icp = computed(() => settings.value?.icpNumber ?? '');

/** 站点概览，用细小的横排数字放在页脚，比单独做个统计页轻 */
const stats = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { label: '文章', value: s.articleCount },
    { label: '作者', value: s.authorCount },
    { label: '评论', value: s.commentCount },
    { label: '阅读', value: s.viewCount },
  ];
});
</script>

<template>
  <footer class="mt-20 border-t border-slate-200 dark:border-slate-800">
    <div class="container-page py-10">
      <div class="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-sm">
          <p class="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{{ siteName }}</p>
          <p v-if="siteDescription" class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {{ siteDescription }}
          </p>

          <div v-if="stats.length" class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span v-for="s in stats" :key="s.label" class="text-xs text-slate-400 dark:text-slate-500">
              {{ s.label }}
              <strong class="ml-0.5 font-semibold text-slate-600 dark:text-slate-300">
                {{ s.value }}
              </strong>
            </span>
          </div>
        </div>

        <div class="flex flex-col gap-4 sm:items-end">
          <nav class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <NuxtLink to="/archives" class="text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400">
              归档
            </NuxtLink>
            <NuxtLink to="/about" class="text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400">
              关于
            </NuxtLink>
            <!-- RSS 由后端直接输出 XML，前端不代理：订阅者拿到的就是源文件。
                 生产环境经 Nginx 反代后与前端同源，见 useSettings 的 apiOrigin 注释 -->
            <a
              :href="rssUrl"
              class="text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
              type="application/rss+xml"
            >
              RSS
            </a>
          </nav>

          <div v-if="socialLinks.length" class="flex flex-wrap gap-3 sm:justify-end">
            <a
              v-for="link in socialLinks"
              :key="link.url"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
            >
              {{ link.name }}
            </a>
          </div>
        </div>
      </div>

      <div
        class="mt-8 flex flex-col gap-2 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800/70 dark:text-slate-500"
      >
        <p>© {{ year }} {{ siteName }}</p>
        <a
          v-if="icp"
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          class="transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          {{ icp }}
        </a>
      </div>
    </div>
  </footer>
</template>
