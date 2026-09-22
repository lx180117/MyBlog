<script setup lang="ts">
import { countWords, renderPreview } from '~/utils/markdown';

/**
 * Markdown 正文编辑框：工具条 + 源码框 + 实时预览。
 *
 * 三个刻意的做法：
 *
 * ① **预览有 220ms 防抖。** 预览里跑的是 marked + highlight.js，
 *    长文每敲一个字就全量重新高亮一次代码块，在低端机上会明显卡顿。
 * ② **用原生 textarea 而不是 el-input。** 工具条插入语法需要拿到真实的
 *    selectionStart/End 并回写光标位置；el-input 的 textarea 是内部实例，
 *    要绕一层 `inputRef.value.textarea` 才拿得到，而且它自带的边框/阴影
 *    还要再覆盖一遍。原生 textarea 更短也更可控。
 * ③ **预览用 marked + DOMPurify**（utils/markdown.ts）。用的是与后端
 *    renderMarkdown 同一个解析器（marked, gfm），这样预览和发布后的
 *    排版一致——解析器不同源的话，表格换行、软换行处理都会露馅。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    minHeight?: number;
    disabled?: boolean;
  }>(),
  {
    placeholder: '在这里写正文，支持 Markdown。可以用工具条插入语法，直接粘贴图片也可以。',
    minHeight: 520,
    disabled: false,
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { uploading, pickAndUpload } = useImageUpload();

type Mode = 'edit' | 'split' | 'preview';
const mode = ref<Mode>('split');

const MODES: { key: Mode; label: string }[] = [
  { key: 'edit', label: '编辑' },
  { key: 'split', label: '分栏' },
  { key: 'preview', label: '预览' },
];

const textarea = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

/* ------------------------------------------------------------ 预览（防抖） */

const html = ref('');
let renderTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue,
  (value) => {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      html.value = renderPreview(value);
    }, 220);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer);
});

const stat = computed(() => countWords(props.modelValue));

/* ------------------------------------------------------------ 选区操作 */

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

/** 在当前选区插入文本，并把光标放到 [from, to] 之间 */
function applyEdit(start: number, end: number, text: string, from: number, to: number) {
  emit('update:modelValue', props.modelValue.slice(0, start) + text + props.modelValue.slice(end));
  nextTick(() => {
    const el = textarea.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(from, to);
  });
}

function selection(): { start: number; end: number; text: string } {
  const el = textarea.value;
  const start = el?.selectionStart ?? props.modelValue.length;
  const end = el?.selectionEnd ?? start;
  return { start, end, text: props.modelValue.slice(start, end) };
}

/** 成对包裹：**加粗**、`代码`、[链接](url) 这类 */
function wrap(before: string, after = before, placeholder = '文本') {
  const { start, end, text } = selection();
  const inner = text || placeholder;
  applyEdit(
    start,
    end,
    before + inner + after,
    start + before.length,
    start + before.length + inner.length,
  );
}

/** 给选中的每一行加前缀：列表、引用 */
function prefixLines(marker: string) {
  const { start, end } = selection();
  const value = props.modelValue;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const found = value.indexOf('\n', end);
  const lineEnd = found === -1 ? value.length : found;

  const block = value.slice(lineStart, lineEnd) || '内容';
  const next = block
    .split('\n')
    .map((line) => marker + line)
    .join('\n');

  applyEdit(lineStart, lineEnd, next, lineStart, lineStart + next.length);
}

/** 插入整块内容（代码块、表格、图片），自动与前面的行隔开 */
function insertBlock(text: string, selectText?: string) {
  const { start, end } = selection();
  const needsBreak = start > 0 && props.modelValue[start - 1] !== '\n';
  const payload = (needsBreak ? '\n' : '') + text;
  const offset = needsBreak ? 1 : 0;
  const from = selectText
    ? start + offset + text.indexOf(selectText)
    : start + payload.length;
  applyEdit(start, end, payload, from, selectText ? from + selectText.length : from);
}

/* ------------------------------------------------------------ 工具条 */

interface Tool {
  label: string;
  title: string;
  /** 用等宽字体显示（B / I / H2 / <> 这类符号） */
  mono?: boolean;
  run: () => void;
}

const tools: Tool[] = [
  { label: 'B', title: '加粗', mono: true, run: () => wrap('**', '**', '加粗文本') },
  { label: 'I', title: '斜体', mono: true, run: () => wrap('*', '*', '斜体文本') },
  { label: 'H2', title: '二级标题', mono: true, run: () => prefixLines('## ') },
  { label: 'H3', title: '三级标题', mono: true, run: () => prefixLines('### ') },
  { label: '引用', title: '引用块', run: () => prefixLines('> ') },
  { label: '•', title: '无序列表', mono: true, run: () => prefixLines('- ') },
  { label: '1.', title: '有序列表', mono: true, run: () => prefixLines('1. ') },
  { label: '`x`', title: '行内代码', mono: true, run: () => wrap('`', '`', 'code') },
  {
    label: '</>',
    title: '代码块',
    mono: true,
    run: () =>
      insertBlock('```ts\n// 代码\n```\n', '// 代码'),
  },
  { label: '链接', title: '链接', run: () => wrap('[', '](https://)', '链接文字') },
  {
    label: '表格',
    title: '3×3 表格',
    run: () =>
      insertBlock(
        '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n',
        '列 1',
      ),
  },
  {
    label: '分割线',
    title: '分割线',
    run: () => insertBlock('---\n'),
  },
];

/* ------------------------------------------------------------ 图片 */

function pickImage() {
  fileInput.value?.click();
}

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  // 立刻清空，否则连续选同一个文件不会再触发 change
  input.value = '';

  const res = await pickAndUpload(file, '图片已上传并插入正文');
  if (!res) return;

  const alt = (file?.name ?? '图片').replace(/\.[^.]+$/, '');
  insertBlock(`![${alt}](${res.url})\n`);
}

/**
 * 粘贴板里带图片时直接上传（截图后 Ctrl+V 是写博客最常见的配图方式）。
 * 只在粘贴内容里确实有图片文件时接管，否则放行普通文本粘贴。
 */
async function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  const image = files.find((f) => f.type.startsWith('image/'));
  if (!image) return;

  event.preventDefault();
  const res = await pickAndUpload(image, '已上传剪贴板图片');
  if (!res) return;
  insertBlock(`![image](${res.url})\n`);
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <!-- 工具条 -->
    <div
      class="flex flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-1.5 dark:border-slate-800"
    >
      <button
        v-for="tool in tools"
        :key="tool.title"
        type="button"
        :title="tool.title"
        :disabled="disabled || uploading"
        class="cursor-pointer rounded px-2 py-1 text-xs text-slate-600 transition
               hover:bg-slate-100 hover:text-slate-900
               disabled:cursor-not-allowed disabled:opacity-40
               dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        :class="tool.mono ? 'font-mono' : ''"
        @click="tool.run"
      >
        {{ tool.label }}
      </button>

      <span class="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />

      <button
        type="button"
        :disabled="disabled || uploading"
        class="cursor-pointer rounded px-2 py-1 text-xs font-medium text-brand-600 transition
               hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40
               dark:text-brand-400 dark:hover:bg-slate-800"
        @click="pickImage"
      >
        {{ uploading ? '上传中…' : '插入图片' }}
      </button>
      <span class="hidden text-xs text-slate-400 sm:inline dark:text-slate-500">
        可直接粘贴截图
      </span>

      <div class="ml-auto flex items-center gap-0.5">
        <button
          v-for="item in MODES"
          :key="item.key"
          type="button"
          class="cursor-pointer rounded px-2 py-1 text-xs transition"
          :class="
            mode === item.key
              ? 'bg-brand-50 font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-300'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          "
          @click="mode = item.key"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <!-- 编辑 / 预览 -->
    <div :class="mode === 'split' ? 'grid lg:grid-cols-2' : 'block'">
      <div
        v-show="mode !== 'preview'"
        :class="mode === 'split' ? 'border-b lg:border-b-0 lg:border-r' : ''"
        class="border-slate-200 dark:border-slate-800"
      >
        <textarea
          ref="textarea"
          :value="modelValue"
          :placeholder="placeholder"
          :disabled="disabled"
          spellcheck="false"
          class="block w-full resize-y bg-transparent px-4 py-3 font-mono text-[13.5px] leading-7
                 text-slate-800 outline-none placeholder:text-slate-400
                 disabled:cursor-not-allowed disabled:opacity-60
                 dark:text-slate-200 dark:placeholder:text-slate-600"
          :style="{ minHeight: `${minHeight}px` }"
          @input="onInput"
          @paste="onPaste"
        />
      </div>

      <div
        v-show="mode !== 'edit'"
        class="overflow-y-auto px-4 py-3"
        :style="{ minHeight: `${minHeight}px`, maxHeight: `${minHeight + 120}px` }"
      >
        <div v-if="html" class="prose-blog" v-html="html" />
        <p v-else class="text-sm text-slate-400 dark:text-slate-500">
          预览区是空的，左边写点什么吧。
        </p>
      </div>
    </div>

    <!-- 状态栏 -->
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-4 py-2
             text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500"
    >
      <span>正文 {{ stat.chars }} 字</span>
      <span>英文 {{ stat.words }} 词</span>
      <span v-if="uploading" class="text-brand-600 dark:text-brand-400">图片上传中…</span>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="hidden"
      @change="onFilePicked"
    />
  </div>
</template>
