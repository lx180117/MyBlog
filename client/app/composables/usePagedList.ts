import type { Ref } from 'vue';
import type { Paginated } from '~/types/pagination';

/**
 * 后台列表页的通用分页加载器。
 *
 * 后台有 8 个列表页（我的文章 / 全站文章 / 评论审核 / 用户 / 分类 / 标签 …），
 * 它们的骨架完全一样：分页参数 + 筛选条件 + loading/error + 删完一条要刷新。
 * 每个页面各写一遍的结果通常是——某个页面忘了处理竞态、另一个页面删空当页后
 * 停在空白页上。所以把这段共性的东西收在一个地方。
 *
 * 两个容易踩的点，这里都处理了：
 *
 * ① **请求竞态**：用户快速连点页码，两个请求并发，先发的后回来就会用旧数据
 *    覆盖新数据，表现为「点了第 3 页却显示第 2 页内容」。用自增序号丢弃过期响应。
 * ② **删空当页**：在第 2 页删掉最后一条后，totalPages 变成 1，此时若还请求
 *    page=2 会拿到空列表，用户以为数据没了。所以删除后如果当页被删空就回退一页。
 */

/** 筛选条件：必须是扁平对象，值会被拼进 query */
export type ListFilters = Record<string, string | number | boolean | undefined>;

export interface UsePagedListOptions {
  /** 每页条数，默认 12（与后端 QueryPaginationDto 的默认值一致） */
  pageSize?: number;
}

export function usePagedList<T, F extends ListFilters>(
  loader: (query: F & { page: number; pageSize: number }) => Promise<Paginated<T>>,
  defaultFilters: F,
  options: UsePagedListOptions = {},
) {
  const page = ref(1);
  const pageSize = ref(options.pageSize ?? 12);
  const filters = reactive({ ...defaultFilters }) as F;

  // 用 ref([]) as Ref<T[]> 而不是 ref<T[]>([])：后者的 UnwrapRef 会把泛型 T
  // 展开成它自己，赋值时会报「不可分配给」，是 Vue 类型上的已知摩擦点
  const items = ref([]) as Ref<T[]>;
  const total = ref(0);
  const totalPages = ref(0);
  const loading = ref(false);
  const error = ref('');

  /** 请求序号，只认最后一次发出的请求 */
  let seq = 0;

  async function load(): Promise<void> {
    const token = ++seq;
    loading.value = true;
    error.value = '';

    try {
      const res = await loader({
        ...(filters as F),
        page: page.value,
        pageSize: pageSize.value,
      } as F & { page: number; pageSize: number });

      if (token !== seq) return; // 已经有更新的请求在路上，丢弃这次结果

      items.value = res.items;
      total.value = res.total;
      totalPages.value = res.totalPages;
    } catch (e) {
      if (token !== seq) return;
      error.value = e instanceof Error ? e.message : '加载失败';
      items.value = [];
      total.value = 0;
      totalPages.value = 0;
    } finally {
      if (token === seq) loading.value = false;
    }
  }

  /** 筛选条件变了：回到第一页再查（留在第 5 页查新条件大概率是空的） */
  function reload(): Promise<void> {
    page.value = 1;
    return load();
  }

  function goPage(target: number): Promise<void> {
    if (target === page.value) return Promise.resolve();
    page.value = target;
    return load();
  }

  function resizePage(size: number): Promise<void> {
    pageSize.value = size;
    page.value = 1;
    return load();
  }

  /**
   * 删掉 `removed` 条之后刷新。
   * 当页被删空且不在第一页时自动回退一页。
   */
  async function reloadAfterRemove(removed = 1): Promise<void> {
    if (items.value.length <= removed && page.value > 1) {
      page.value -= 1;
    }
    await load();
  }

  return {
    page,
    pageSize,
    filters,
    items,
    total,
    totalPages,
    loading,
    error,
    load,
    reload,
    goPage,
    resizePage,
    reloadAfterRemove,
  };
}
