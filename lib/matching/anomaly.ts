import {
  ANOMALY_ABSOLUTE_THRESHOLD,
  ANOMALY_HISTORY_MONTHS,
  ANOMALY_MIN_HISTORY,
  ANOMALY_MULTIPLIER,
} from './config';
import type { HistoryEntry } from './types';

const rupiah = (value: number) => `Rp ${Math.round(value).toLocaleString('id-ID')}`;

/** With a baseline, compare to the vendor's mean; without one, to the absolute threshold. */
export function checkAnomaly(
  total: number | null,
  vendorId: string,
  history: HistoryEntry[],
  now: Date,
): { anomalyFlag: boolean; anomalyReason?: string } {
  if (total === null) return { anomalyFlag: false };

  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - ANOMALY_HISTORY_MONTHS);

  const amounts = history.flatMap((entry) =>
    entry.review_status === 'PAID' &&
    entry.vendor_id === vendorId &&
    entry.total_amount !== null &&
    entry.paid_at !== null &&
    new Date(entry.paid_at) >= since
      ? [entry.total_amount]
      : [],
  );

  if (amounts.length >= ANOMALY_MIN_HISTORY) {
    const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    if (total <= mean * ANOMALY_MULTIPLIER) return { anomalyFlag: false };
    const ratio = (total / mean).toLocaleString('id-ID', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return {
      anomalyFlag: true,
      anomalyReason: `Total ${rupiah(total)} lebih dari ${ANOMALY_MULTIPLIER}× rata-rata ${rupiah(mean)} dari ${amounts.length} invoice PAID dalam ${ANOMALY_HISTORY_MONTHS} bulan (rasio ${ratio}×).`,
    };
  }

  if (total <= ANOMALY_ABSOLUTE_THRESHOLD) return { anomalyFlag: false };
  return {
    anomalyFlag: true,
    anomalyReason: `Total ${rupiah(total)} melebihi ambang ${rupiah(ANOMALY_ABSOLUTE_THRESHOLD)}; histori vendor kurang dari ${ANOMALY_MIN_HISTORY} invoice PAID.`,
  };
}
