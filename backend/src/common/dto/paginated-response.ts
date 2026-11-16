export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  query: { page: number; limit: number },
): Paginated<T> {
  return { items, total, page: query.page, limit: query.limit };
}

// Number of documents to skip for the given page (pages start at 1)
export function getSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
