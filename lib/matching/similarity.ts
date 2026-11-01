import { JARO_WINKLER_MAX_PREFIX, JARO_WINKLER_SCALING } from './config';

function jaro(a: string, b: string): number {
  const window = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const matchedA: boolean[] = [];
  const matchedB: boolean[] = [];
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const end = Math.min(i + window + 1, b.length);
    for (let j = Math.max(i - window, 0); j < end; j++) {
      if (matchedB[j] || a[i] !== b[j]) continue;
      matchedA[i] = matchedB[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!matchedA[i]) continue;
    while (!matchedB[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3
  );
}

/** Jaro-Winkler, 0 to 1. Empty input scores 0, never 1. */
export function jaroWinkler(a: string, b: string): number {
  if (!a || !b) return 0;
  const score = jaro(a, b);
  let prefix = 0;
  while (prefix < JARO_WINKLER_MAX_PREFIX && a[prefix] !== undefined && a[prefix] === b[prefix]) {
    prefix++;
  }
  return score + prefix * JARO_WINKLER_SCALING * (1 - score);
}
