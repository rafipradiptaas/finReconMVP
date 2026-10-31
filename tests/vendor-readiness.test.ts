import { describe, expect, it } from 'vitest';
import { vendorReadiness } from '@/lib/vendor-readiness';

const now = new Date('2026-10-31T12:00:00Z');
const vendor = {
  status: 'verified',
  npwp: '011234567891000',
  bank_name: 'BCA',
  bank_account_number: '123',
  bank_account_holder: 'PT A',
  last_verified_at: '2026-01-01',
};

describe('vendorReadiness', () => {
  it('is Aman when verified, complete and fresh', () => {
    expect(vendorReadiness(vendor, now)).toBe('Aman');
  });

  it('treats exactly 12 months as fresh and one day more as stale', () => {
    expect(vendorReadiness({ ...vendor, last_verified_at: '2025-10-31' }, now)).toBe('Aman');
    expect(vendorReadiness({ ...vendor, last_verified_at: '2025-10-30' }, now)).toBe('Perlu Review');
  });

  it('needs review when never verified', () => {
    expect(vendorReadiness({ ...vendor, last_verified_at: null }, now)).toBe('Perlu Review');
  });

  it.each(['unverified', 'suspended'])('is Belum Siap when %s', (status) => {
    expect(vendorReadiness({ ...vendor, status }, now)).toBe('Belum Siap');
  });

  it.each(['npwp', 'bank_name', 'bank_account_number', 'bank_account_holder'])(
    'is Belum Siap when %s is empty',
    (field) => {
      expect(vendorReadiness({ ...vendor, [field]: null }, now)).toBe('Belum Siap');
    },
  );
});
