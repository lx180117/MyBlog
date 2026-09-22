import type { CategoryResponseDto, TagResponseDto } from '~/types/api';

/**
 * 分类与标签（GET /categories、GET /tags）。
 *
 * 这两份数据是「几乎每页都要、但极少变」的典型：文章页要显示标签、
 * 侧栏要显示分类、编辑器要选分类。用 useState 全局缓存一次，
 * 后续所有页面直接读，不再重复请求。后端的 /categories 与 /tags
 * 本身也是轻量查询，但重复拉十几次没有意义。
 */
export function useTaxonomy() {
  const api = useApi();

  const categories = useState<CategoryResponseDto[]>('taxonomy-categories', () => []);
  const tags = useState<TagResponseDto[]>('taxonomy-tags', () => []);
  const loaded = useState<boolean>('taxonomy-loaded', () => false);
  const inflight = useState<Promise<void> | null>('taxonomy-inflight', () => null);

  async function loadTaxonomy(force = false): Promise<void> {
    if (!force && loaded.value) return;
    if (inflight.value) return inflight.value;

    inflight.value = (async () => {
      try {
        const [c, t] = await Promise.all([
          api.get<CategoryResponseDto[]>('/categories', { anonymous: true }),
          api.get<TagResponseDto[]>('/tags', { anonymous: true }),
        ]);
        categories.value = c;
        tags.value = t;
        loaded.value = true;
      } catch {
        // 侧栏数据拿不到不该让整页挂掉；留空数组，页面其余部分照常渲染
      } finally {
        inflight.value = null;
      }
    })();

    return inflight.value;
  }

  /** 分类下拉用的选项（Element Plus 的 select 需要 {label,value}） */
  const categoryOptions = computed(() =>
    categories.value.map((c) => ({ label: `${c.name}（${c.articleCount}）`, value: c.id })),
  );

  /** 标签名 → 提示列表，编辑器里做输入建议 */
  const tagNames = computed(() => tags.value.map((t) => t.name));

  function findCategory(id?: string | null) {
    if (!id) return null;
    return categories.value.find((c) => c.id === id) ?? null;
  }

  return {
    categories,
    tags,
    loaded,
    loadTaxonomy,
    categoryOptions,
    tagNames,
    findCategory,
  };
}
