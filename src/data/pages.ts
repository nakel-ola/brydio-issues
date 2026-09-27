export interface Page<T> { items: T[]; nextCursor: string | null }
export type PageList<T> = (collection: string, query: Record<string, unknown>) => Promise<Page<T>>;

export async function readAll<T>(
  list: PageList<T>,
  collection: string,
  query: Record<string, unknown> = {},
  current: () => boolean = () => true,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;

  do {
    const page: Page<T> = await list(collection, { ...query, limit: 200, ...(cursor ? { cursor } : {}) });

    if (!current()) return [];
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  return items;
}
