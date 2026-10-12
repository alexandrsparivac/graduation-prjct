export const QUERY_PAGE_SIZE = 500;

export async function fetchAllRows(query, pageSize = QUERY_PAGE_SIZE) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('Page size must be a positive safe integer');
  }

  const rows = [];
  let offset = 0;
  let total = null;
  while (total === null || offset < total) {
    const { data, error, count } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (total === null) {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error('Paginated query did not return an exact row count');
      }
      total = count;
    }

    const page = data || [];
    if (!page.length && offset < total) {
      throw new Error(`Paginated query stopped after ${offset} of ${total} rows`);
    }
    rows.push(...page);
    offset += page.length;
  }
  return rows;
}
