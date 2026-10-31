import {
  normalizeDigits,
  normalizeText,
} from '../lib/extraction-checks/normalize';

/**
 * Compares an extracted value with ground truth (product doc 12.3). Money must
 * match exactly after normalization, and invoice numbers compare as uppercase
 * + trim, so the letter O for a zero stays wrong.
 */
export function fieldCorrect(field: string, predicted: unknown, truth: unknown): boolean {
  if (field === 'tax_amount') {
    return Math.round(Number(predicted ?? 0) * 100) === Math.round(Number(truth ?? 0) * 100);
  }
  if (predicted === null || predicted === undefined || truth === null || truth === undefined) {
    return (predicted ?? null) === (truth ?? null);
  }
  if (field === 'subtotal' || field === 'total_amount') {
    return Math.round(Number(predicted) * 100) === Math.round(Number(truth) * 100);
  }
  if (field === 'npwp' || field === 'bank_account_number') {
    return normalizeDigits(String(predicted)) === normalizeDigits(String(truth));
  }
  return (
    normalizeText(String(predicted)).toUpperCase() === normalizeText(String(truth)).toUpperCase()
  );
}
