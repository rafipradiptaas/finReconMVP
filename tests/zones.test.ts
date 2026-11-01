import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });

const importsOf = (path: string) =>
  [...readFileSync(path, 'utf8').matchAll(/from\s+'([^']+)'|import\(\s*'([^']+)'/g)].map(
    (match) => match[1] ?? match[2],
  );

const ALL = ['app', 'lib', 'scripts', 'components'].flatMap((dir) => {
  try {
    return files(dir);
  } catch {
    return [];
  }
});

describe('zone boundaries', () => {
  it('provider SDKs are imported only inside lib/llm/providers (D19, D23)', () => {
    const offenders = ALL.filter(
      (path) =>
        !path.startsWith('lib/llm/providers/') &&
        importsOf(path).some((name) => /^(@anthropic-ai\/|openai($|\/))/.test(name)),
    );
    expect(offenders).toEqual([]);
  });

  it('deterministic folders import nothing from the AI zone', () => {
    const deterministic = ALL.filter((path) =>
      /^lib\/(document-router|extraction-checks|matching|review|followup-checks|email)\//.test(path),
    );
    const offenders = deterministic.filter((path) =>
      importsOf(path).some((name) => /lib\/(llm|agent|chatbot)|^\.\.?\/.*\/(llm|agent|chatbot)\//.test(name)),
    );
    expect(deterministic.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('pure folders do no I/O', () => {
    const pure = ALL.filter((path) => /^lib\/(extraction-checks|matching)\//.test(path));
    const offenders = pure.filter(
      (path) =>
        importsOf(path).some((name) => /supabase|^node:|^fs$|server-only/.test(name)) ||
        /Date\.now\(\)|new Date\(\)/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('the vision path is not reachable from the app (product doc 6.1)', () => {
    const appCode = ALL.filter((path) => !path.startsWith('scripts/') && path !== 'lib/llm/extract-invoice-vision.ts');
    const offenders = appCode.filter((path) => importsOf(path).some((name) => name.includes('extract-invoice-vision')));
    expect(offenders).toEqual([]);
  });
});
