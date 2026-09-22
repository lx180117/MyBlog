<script setup lang="ts">
import type { TocItemDto } from '~/types/api';

/**
 * 文章目录（TOC）。
 *
 * 目录数据来自后端（`toc` 字段，由 extractToc 从 Markdown 源扫出来），
 * 前端不重新解析全文 —— 服务端解析一次比每篇文章都在浏览器里跑一遍正则便宜。
 *
 * 锚点匹配靠**文档顺序**而不是文本比对，原因见 utils/content.ts 的注释：
 * 后端 TOC 的 anchor 由 Markdown 源文本算出，DOM 里拿到的是渲染后的纯文本，
 * 遇到标题内含链接时两者会分叉。同序配对则永远对得上。
 */
const props = defineProps<{ items: TocItemDto[] }>();

const activeId = ref('');
const container = ref<HTMLElement | null>(null);

/**
 * 滚动高亮。
 *
 * 用 IntersectionObserver 而不是 scroll 事件 + 逐个 getBoundingClientRect：
 * 后者每次滚动都会强制同步布局（layout thrashing），长文里会明显卡顿。
 * 这里一次性观察所有标题，浏览器在合成帧里批量回调，代价低得多。
 */
onMounted(() => {
  const headings = props.items
    .map((i) => document.getElementById(i.anchor))
    .filter((el): el is HTMLElement => Boolean(el));

  if (!headings.length) return;

  // 用「当前视口内最靠上的标题」作为高亮项。
  // 用 rootMargin 把判定线上移到顶栏下方，避免标题刚进入视口就抢高亮。
  const visible = new Set<string>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      }
      if (visible.size) {
        // 保持文档顺序里的第一个
        const first = headings.find((h) => visible.has(h.id));
        if (first) activeId.value = first.id;
      } else {
        // 全都不在视口内（两段标题之间的长正文）→ 取最后一个已滚过的标题
        const passed = headings.filter((h) => h.getBoundingClientRect().top < 120);
        const last = passed[passed.length - 1];
        if (last) activeId.value = last.id;
      }
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
  );

  headings.forEach((h) => observer.observe(h));
  onBeforeUnmount(() => observer.disconnect());
});

const minLevel = computed(() => Math.min(...props.items.map((i) => i.level), 2));
</script>

<template>
  <nav v-if="items.length" ref="container" class="text-sm" aria-label="文章目录">
    <p class="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">目录</p>
    <ul class="space-y-1 border-l border-slate-200 dark:border-slate-800">
      <li v-for="item in items" :key="item.anchor">
        <a
          :href="`#${item.anchor}`"
          class="block border-l-2 py-1 pr-2 leading-snug transition"
          :class="
            activeId === item.anchor
              ? 'border-brand-500 font-medium text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          "
          :style="{ paddingLeft: `${(item.level - minLevel) * 0.75 + 0.75}rem` }"
        >
          {{ item.text }}
        </a>
      </li>
    </ul>
  </nav>
</template>
