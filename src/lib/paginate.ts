/**
 * Fetch every row for a query, paging past PostgREST's default 1000-row cap.
 * The caller supplies a factory that applies `.range(from, to)` to an already
 * ordered query. Include a deterministic order (e.g. an `id` tiebreaker) so
 * pages don't skip or duplicate rows.
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await makeQuery(from, from + pageSize - 1);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

/** Split an array into chunks of at most `size`. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
