'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FollowupStatus } from '@/types/domain';

type FraudReason = { source: 'rule' | 'ai'; reason: string };

type Reply = {
  id: string;
  body: string;
  proposed_po_number: string | null;
  proposed_po_valid: boolean | null;
  fraud_flag: boolean;
  fraud_reasons: FraudReason[];
  created_at: string;
};

export type Followup = {
  id: string;
  status: FollowupStatus;
  recipient: string | null;
  subject: string;
  body: string;
  ai_generated_body: string;
  edited: boolean;
  sent_at: string | null;
  provider_message_id: string | null;
  followup_replies: Reply[];
};

const STATUS_LABELS: Record<FollowupStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Terkirim',
  DISCARDED: 'Dibuang',
};

async function call(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json();
}

/** Lines still as the AI wrote them are marked until a person changes them (product doc 9.3). */
function MarkedBody({ body, aiBody }: { body: string; aiBody: string }) {
  const aiLines = new Set(aiBody.split('\n'));
  return (
    <div className="space-y-1 rounded-lg border p-3 text-sm">
      {body.split('\n').map((line, index) => (
        <p
          key={index}
          data-ai={line.trim() !== '' && aiLines.has(line) ? '' : undefined}
          className={`min-h-4 whitespace-pre-wrap ${line.trim() !== '' && aiLines.has(line) ? 'bg-yellow-100' : ''}`}
        >
          {line}
        </p>
      ))}
      <p className="text-muted-foreground pt-1 text-xs">Bagian kuning masih tulisan AI.</p>
    </div>
  );
}

function ReplyCard({
  reply,
  documentId,
  canAcceptPo,
  run,
}: {
  reply: Reply;
  documentId: string;
  canAcceptPo: boolean;
  run: (path: string, method: string, body?: unknown) => Promise<void>;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      {reply.fraud_flag && (
        <div className="border-destructive text-destructive space-y-1 rounded-md border p-2" role="alert">
          <p className="font-medium">Peringatan: kemungkinan penipuan. Jangan ubah rekening dari email ini.</p>
          <ul className="list-disc pl-4">
            {reply.fraud_reasons.map(({ source, reason }) => (
              <li key={`${source}:${reason}`}>
                {reason}
                {source === 'ai' && ' (Dibuat AI)'}
              </li>
            ))}
          </ul>
          <p className="text-xs">Tidak ada data yang berubah. Hubungi vendor lewat kontak yang sudah dikenal.</p>
        </div>
      )}
      <p className="whitespace-pre-wrap">{reply.body}</p>
      {reply.proposed_po_number && (
        <div className="flex items-center gap-2">
          <span>
            Usulan nomor PO: {reply.proposed_po_number}
            {!reply.proposed_po_valid && ' (tidak valid untuk vendor ini)'}
          </span>
          <Badge variant="secondary">Dibuat AI</Badge>
          {reply.proposed_po_valid && canAcceptPo && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                run(`/api/documents/${documentId}/correct`, 'POST', {
                  corrections: { po_number: reply.proposed_po_number },
                  acceptedReplyId: reply.id,
                })
              }
            >
              Terima
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FollowupPanel({
  matchId,
  documentId,
  contactEmail,
  canAcceptPo,
  followups,
}: {
  matchId: string;
  documentId: string;
  contactEmail: string | null;
  canAcceptPo: boolean;
  followups: Followup[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<{ subject?: string; body?: string }>({});
  const [reply, setReply] = useState('');

  const draft = followups.find(({ status }) => status === 'DRAFT');
  const sent = followups.filter(({ status }) => status === 'SENT');

  async function run(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const result = await call(path, method, body);
      if (result.ok) {
        setEdits({});
        setReply('');
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

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="font-medium">Follow-up vendor</h2>
      {!contactEmail ? (
        <p className="text-sm">Kontak vendor belum ada. Minta admin melengkapi master data.</p>
      ) : (
        <p className="text-sm">
          Penerima (dari master vendor): <span className="font-medium">{contactEmail}</span>
        </p>
      )}

      {contactEmail && !draft && (
        <Button disabled={busy} onClick={() => run('/api/followups', 'POST', { matchId })}>
          {busy ? 'Membuat draft…' : 'Buat draft follow-up'}
        </Button>
      )}

      {draft && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Dibuat AI</Badge>
            {draft.edited && <span className="text-muted-foreground text-xs">sudah diedit</span>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="followup-subject">Subjek</Label>
            <Input
              id="followup-subject"
              value={edits.subject ?? draft.subject}
              onChange={(event) => setEdits((all) => ({ ...all, subject: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="followup-body">Isi email</Label>
            <Textarea
              id="followup-body"
              rows={8}
              value={edits.body ?? draft.body}
              onChange={(event) => setEdits((all) => ({ ...all, body: event.target.value }))}
            />
          </div>
          <MarkedBody body={edits.body ?? draft.body} aiBody={draft.ai_generated_body} />
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || Object.keys(edits).length === 0}
              onClick={() => run(`/api/followups/${draft.id}`, 'PATCH', edits)}
            >
              Simpan draft
            </Button>
            <Button
              disabled={busy || Object.keys(edits).length > 0 || !contactEmail}
              onClick={() => run(`/api/followups/${draft.id}/send`, 'POST')}
            >
              Kirim
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => run(`/api/followups/${draft.id}`, 'PATCH', { discard: true })}
            >
              Buang
            </Button>
          </div>
        </div>
      )}

      {sent.map((followup) => (
        <div key={followup.id} className="space-y-3 border-t pt-3">
          <p className="text-sm">
            <Badge variant="outline">{STATUS_LABELS[followup.status]}</Badge> ke {followup.recipient}:{' '}
            {followup.subject}
            {followup.provider_message_id === 'dry_run' && (
              <span className="text-muted-foreground text-xs"> (mode uji, tidak benar-benar terkirim)</span>
            )}
          </p>
          <p className="text-sm whitespace-pre-wrap">{followup.body}</p>
          {followup.followup_replies.map((item) => (
            <ReplyCard key={item.id} reply={item} documentId={documentId} canAcceptPo={canAcceptPo} run={run} />
          ))}
          <div className="space-y-1">
            <Label htmlFor={`reply-${followup.id}`}>Tempel balasan vendor</Label>
            <Textarea id={`reply-${followup.id}`} value={reply} onChange={(event) => setReply(event.target.value)} />
            <Button
              variant="outline"
              disabled={busy || reply.trim() === ''}
              onClick={() => run(`/api/followups/${followup.id}/replies`, 'POST', { body: reply })}
            >
              Simpan balasan
            </Button>
          </div>
        </div>
      ))}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
