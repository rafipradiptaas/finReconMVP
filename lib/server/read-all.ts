import 'server-only';

const PAGE_SIZE = 1000;

/**
 * PostgREST caps a response at 1000 rows, and a short read could silently miss
 * a duplicate or an audit row, so a list that must be complete is paged to the end.
 */
export async function readAll<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}
