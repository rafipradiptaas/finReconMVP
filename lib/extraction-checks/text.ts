import type { TextItem } from './types';

/** Items on one line differ by less than this many points in y. */
export const SAME_LINE_POINTS = 3;

/** One printed line per line of text. Separate items on a line are joined by two spaces. */
export function textFromItems(items: TextItem[]): string {
  const lines: string[] = [];
  let previous: TextItem | undefined;
  for (const item of items) {
    const sameLine =
      previous?.page === item.page && Math.abs(previous.bbox.y - item.bbox.y) < SAME_LINE_POINTS;
    if (sameLine) lines[lines.length - 1] += `  ${item.str}`;
    else lines.push(item.str);
    previous = item;
  }
  return lines.join('\n');
}
