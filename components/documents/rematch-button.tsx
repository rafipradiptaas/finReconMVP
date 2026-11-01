'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MATCHING_FAILED_LABEL } from '@/types/domain';

export function RematchButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rematch() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/rematch`, { method: 'POST' });
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
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={rematch}>
        {busy ? 'Mencocokkan…' : MATCHING_FAILED_LABEL}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
