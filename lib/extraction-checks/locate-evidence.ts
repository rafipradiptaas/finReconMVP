import type { Evidence, TextItem } from './types';

const squash = (text: string) => text.replace(/\s+/g, '').toUpperCase();

/**
 * Finds a snippet in the router's items, within one item or across neighbouring
 * ones, and returns every place it occurs. Whitespace and case never decide a
 * match: the extractor tends to tidy both.
 */
export function locateEvidence(sourceText: string | null, items: TextItem[]): Evidence[] {
  const needle = squash(sourceText ?? '');
  if (!needle) return [];

  const found: Evidence[] = [];
  for (const page of new Set(items.map((item) => item.page))) {
    const pageItems = items.filter((item) => item.page === page);
    const owners: number[] = [];
    let haystack = '';
    pageItems.forEach((item, index) => {
      const text = squash(item.str);
      haystack += text;
      owners.push(...Array<number>(text.length).fill(index));
    });

    const hits = new Set<number>();
    for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
      for (let i = at; i < at + needle.length; i++) hits.add(owners[i]);
    }
    for (const index of [...hits].sort((a, b) => a - b)) {
      found.push({ page, bbox: pageItems[index].bbox });
    }
  }
  return found;
}
