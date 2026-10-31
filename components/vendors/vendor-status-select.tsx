'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES, type VendorStatus } from '@/types/domain';

export function VendorStatusSelect({ vendorId, status }: { vendorId: string; status: VendorStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const result = await response.json();
      if (result.ok) router.refresh();
      else setError(result.error.message);
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Select value={status} onValueChange={change} disabled={busy}>
        <SelectTrigger size="sm" aria-label="Status vendor">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VENDOR_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {VENDOR_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
