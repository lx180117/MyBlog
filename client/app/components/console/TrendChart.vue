<script setup lang="ts">
import type { TrendPointDto } from '~/types/api';

/**
 * 访问/评论/发文的趋势曲线。
 *
 * 为什么手写 SVG 而不是引 ECharts：
 *   后台只需要一条折线 + 面积填充，ECharts 的运行时是 300KB+ 级别，
 *   而这个站点的前台读者连 Element Plus 的 CSS 都要单独隔离开（见 console.vue）。
 *   为了一个仪表盘图表给后台 chunk 加 300KB 不划算 ——
 *   这里 40 行的 path 拼接就够用，而且颜色能直接跟着 Tailwind 的深色模式走。
 */
const props = withDefaults(
  defineProps<{
    points: TrendPointDto[];
    metric: 'views' | 'comments' | 'articles';
    loading?: boolean;
  }>(),
  { loading: false },
);

const W = 720;
const H = 230;
const PAD = { top: 18, right: 16, bottom: 30, left: 46 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const METRIC_META = {
  views: { label: '访问量', stroke: '#4f46e5', fill: 'rgba(79, 70, 229, 0.14)' },
  comments: { label: '评论数', stroke: '#d97706', fill: 'rgba(217, 119, 6, 0.14)' },
  articles: { label: '发文数', stroke: '#059669', fill: 'rgba(5, 150, 105, 0.14)' },
};

const meta = computed(() => METRIC_META[props.metric]);
const values = computed(() => props.points.map((p) => Number(p[props.metric] ?? 0)));
/** 全是 0 的时候分母会变成 0，兜一个 1，否则折线会跑到画布外 */
const maxValue = computed(() => Math.max(1, ...values.value));

function xAt(index: number): number {
  if (props.points.length <= 1) return PAD.left + plotW / 2;
  return PAD.left + (index * plotW) / (props.points.length - 1);
}

function yAt(value: number): number {
  return PAD.top + plotH - (value / maxValue.value) * plotH;
}

const linePath = computed(() =>
  values.value
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`)
    .join(' '),
);

const areaPath = computed(() => {
  const n = props.points.length;
  if (n === 0) return '';
  const bottom = (PAD.top + plotH).toFixed(2);
  return `${linePath.value} L${xAt(n - 1).toFixed(2)},${bottom} L${xAt(0).toFixed(2)},${bottom} Z`;
});

/** 5 条水平网格线：从上到下依次是 max、3/4、1/2、1/4、0 */
const gridLines = computed(() =>
  [0, 1, 2, 3, 4].map((i) => ({
    y: PAD.top + (plotH * i) / 4,
    label: Math.round(maxValue.value * (1 - i / 4)),
  })),
);

/** X 轴日期：最多标 7 个，避免密集重叠 */
const xLabels = computed(() => {
  const n = props.points.length;
  if (n === 0) return [] as { x: number; text: string; anchor: string }[];
  const step = Math.max(1, Math.ceil(n / 7));
  const out: { x: number; text: string; anchor: string }[] = [];
  for (let i = 0; i < n; i += step) {
    const point = props.points[i];
    if (!point) continue;
    out.push({
      x: xAt(i),
      // date 是 YYYY-MM-DD，只留 MM-DD
      text: point.date.slice(5),
      anchor: i === 0 ? 'start' : 'middle',
    });
  }
  return out;
});

const peak = computed(() => {
  const n = props.points.length;
  if (n === 0) return null;
  let best = 0;
  for (let i = 1; i < n; i++) {
    if ((values.value[i] ?? 0) > (values.value[best] ?? 0)) best = i;
  }
  const point = props.points[best];
  if (!point) return null;
  return { date: point.date, value: values.value[best] ?? 0 };
});

const sum = computed(() => values.value.reduce((a, b) => a + b, 0));
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
        近 {{ points.length }} 天{{ meta.label }}
      </p>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        合计 <span class="font-semibold tabular-nums">{{ sum }}</span>
        <template v-if="peak">
          · 峰值 <span class="font-semibold tabular-nums">{{ peak.value }}</span>
          （{{ peak.date }}）
        </template>
      </p>
    </div>

    <div v-if="loading" class="skeleton h-[200px] w-full" />

    <p
      v-else-if="!points.length"
      class="flex h-[200px] items-center justify-center text-sm text-slate-400 dark:text-slate-500"
    >
      这段时间还没有数据
    </p>

    <svg v-else :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img" :aria-label="`${meta.label}趋势图`">
      <!-- 网格与 Y 轴刻度 -->
      <g>
        <line
          v-for="line in gridLines"
          :key="`g-${line.y}`"
          :x1="PAD.left"
          :x2="W - PAD.right"
          :y1="line.y"
          :y2="line.y"
          class="stroke-slate-200 dark:stroke-slate-800"
          stroke-width="1"
        />
        <text
          v-for="line in gridLines"
          :key="`t-${line.y}`"
          :x="PAD.left - 8"
          :y="line.y + 3.5"
          text-anchor="end"
          class="fill-slate-400 text-[10px] dark:fill-slate-500"
        >
          {{ line.label }}
        </text>
      </g>

      <!-- 面积 + 折线 -->
      <path :d="areaPath" :fill="meta.fill" />
      <path
        :d="linePath"
        fill="none"
        :stroke="meta.stroke"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <!-- 数据点：点多的时候不画，画面会很脏 -->
      <g v-if="points.length <= 31">
        <circle
          v-for="(v, i) in values"
          :key="`p-${i}`"
          :cx="xAt(i)"
          :cy="yAt(v)"
          r="2.5"
          :fill="meta.stroke"
        />
      </g>

      <!-- X 轴日期 -->
      <text
        v-for="label in xLabels"
        :key="`x-${label.x}`"
        :x="label.x"
        :y="H - 10"
        :text-anchor="label.anchor"
        class="fill-slate-400 text-[10px] dark:fill-slate-500"
      >
        {{ label.text }}
      </text>
    </svg>
  </div>
</template>
