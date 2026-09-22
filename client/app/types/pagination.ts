/**
 * 后端所有列表接口的统一分页响应。
 *
 * 这个形状来自 openapi.json 的文档描述：
 * 「列表接口统一返回 `{ items, total, page, pageSize, totalPages }`」。
 * 因为它是**每个列表接口各自定义**的（没有单独抽成一个 schema），
 * 生成器没法给出一个统一的名字，所以在这里手写一次。
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 「操作成功」类接口的统一返回 */
export interface OperationResult {
  success: boolean;
  message?: string;
}

export function emptyPage<T>(pageSize = 12): Paginated<T> {
  return { items: [], total: 0, page: 1, pageSize, totalPages: 0 };
}
