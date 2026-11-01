'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ANOMALY_REASON_MIN_CHARS,
  reviewBlock,
  validateDecision,
  type ReviewDecision,
  type ReviewItem,
  type ReviewMatch,
} from '@/lib/review';
import type { Role } from '@/types/domain';

type Props = {
  matchId: string;
  match: ReviewMatch;
  requiredItems: ReviewItem[];
  actorId: string;
  role: Role;
  uploadedBy: string | null;
  duplicateDecided: boolean;
  matchingFailed: boolean;
};

async function post(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json();
}

/** Mirrors lib/review: the buttons open when the server would accept the decision. */
export function ReviewActions(props: Props) {
  const { matchId, match, requiredItems, actorId, role, uploadedBy, duplicateDecided, matchingFailed } = props;
  const router = useRouter();
  const [ticked, setTicked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = reviewBlock({ actorId, uploadedBy, match, matchingFailed });
  const decided = match.review_status !== 'PENDING_REVIEW';
  const canDecide = blocked === null;
  const check = (decision: ReviewDecision) =>
    validateDecision({
      decision,
      itemsTicked: ticked,
      reason,
      actorId,
      uploadedBy,
      match,
      requiredItems,
      duplicateDecided,
      matchingFailed,
    });

  // Opens once per visit, so opened_at is when the reviewer first saw the panel.
  const opened = useRef(false);
  useEffect(() => {
    if (!canDecide || opened.current) return;
    opened.current = true;
    void post(`/api/matches/${matchId}/session`).catch(() => {});
  }, [canDecide, matchId]);

  async function run(path: string, body?: unknown, onDone?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await post(path, body);
      if (result.ok) {
        onDone?.();
        router.refresh();
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setBusy(false);
    }
  }

  const decide = (decision: ReviewDecision) =>
    run(`/api/matches/${matchId}/review`, { decision, itemsTicked: ticked, reason });

  return (
    <div className="space-y-6">
      {canDecide ? (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="font-medium">Keputusan review</h2>
          {requiredItems.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Wajib dicentang sebelum menyetujui</legend>
              {requiredItems.map(({ id, label }) => (
                <div key={id} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    checked={ticked.includes(id)}
                    onCheckedChange={(checked) =>
                      setTicked((all) => (checked ? [...all, id] : all.filter((item) => item !== id)))
                    }
                  />
                  <Label htmlFor={id} className="leading-snug font-normal">
                    {label}
                  </Label>
                </div>
              ))}
            </fieldset>
          )}
          <div className="space-y-1">
            <Label htmlFor="review-reason">Alasan</Label>
            <Textarea id="review-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            {match.anomaly_flag && (
              <p className="text-muted-foreground text-xs">
                Anomali: alasan minimal {ANOMALY_REASON_MIN_CHARS} karakter ({reason.trim().length} sekarang).
              </p>
            )}
          </div>
          {duplicateDecided && (
            <p className="text-destructive text-sm" role="alert">
              Invoice dengan nomor dan vendor yang sama sudah disetujui atau dibayar. Invoice ini hanya bisa ditolak.
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy || !check('APPROVED').ok} onClick={() => decide('APPROVED')}>
              Setujui
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !check('REJECTED_BY_REVIEWER').ok}
              onClick={() => decide('REJECTED_BY_REVIEWER')}
            >
              Tolak
            </Button>
          </div>
        </div>
      ) : (
        !decided && <p className="text-sm">{blocked?.message}</p>
      )}

      {match.review_status === 'APPROVED' &&
        (role === 'approver' ? (
          <Button disabled={busy} onClick={() => run(`/api/matches/${matchId}/mark-paid`)}>
            Tandai dibayar
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">Hanya approver yang bisa menandai dibayar.</p>
        ))}

      <div className="space-y-2">
        <Label htmlFor="investigation-note">Catatan investigasi</Label>
        <Textarea id="investigation-note" value={note} onChange={(event) => setNote(event.target.value)} />
        <Button
          variant="outline"
          disabled={busy || note.trim() === ''}
          onClick={() => run(`/api/matches/${matchId}/note`, { note }, () => setNote(''))}
        >
          Simpan catatan
        </Button>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
