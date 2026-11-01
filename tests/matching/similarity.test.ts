import { describe, expect, it } from 'vitest';
import { jaroWinkler } from '@/lib/matching/similarity';

describe('jaroWinkler', () => {
  it.each([
    ['MARTHA', 'MARHTA', 0.9611],
    ['DIXON', 'DICKSONX', 0.8133],
    ['DWAYNE', 'DUANE', 0.84],
    ['CRATE', 'TRACE', 0.7333],
  ])('%s / %s ≈ %d', (a, b, expected) => {
    expect(jaroWinkler(a, b)).toBeCloseTo(expected, 3);
  });

  it('identical strings score 1', () => {
    expect(jaroWinkler('PT SINAR LOGISTIK', 'PT SINAR LOGISTIK')).toBe(1);
    expect(jaroWinkler('A', 'A')).toBe(1);
  });

  it('an empty string scores 0', () => {
    expect(jaroWinkler('', 'ABC')).toBe(0);
    expect(jaroWinkler('ABC', '')).toBe(0);
    expect(jaroWinkler('', '')).toBe(0);
  });

  it('nothing in common scores 0', () => {
    expect(jaroWinkler('ABC', 'XYZ')).toBe(0);
  });

  it('is symmetric', () => {
    expect(jaroWinkler('MARTHA', 'MARHTA')).toBe(jaroWinkler('MARHTA', 'MARTHA'));
  });

  it('caps the prefix bonus at 4 characters', () => {
    // Jaro is 0.8095 and 5 characters are shared; the bonus still counts only 4.
    expect(jaroWinkler('ABCDEFG', 'ABCDEXY')).toBeCloseTo(0.8857, 3);
  });
});
