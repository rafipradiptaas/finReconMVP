'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { PdfViewer } from '@/components/pdf-viewer/pdf-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CheckedField, CheckedInvoice, Evidence, ScalarField } from '@/lib/extraction-checks';
import { normalizeMoney } from '@/lib/extraction-checks/normalize';
import {
  CRITICAL_EXTRACTION_FIELDS,
  FIELD_LABELS,
  MANUAL_NOT_IN_DOCUMENT,
  type FieldConfidence,
  type FieldVerification,
} from '@/types/domain';

const FIELDS: { name: ScalarField; money?: boolean }[] = [
  { name: 'invoice_number' },
  { name: 'invoice_date' },
  { name: 'vendor_name' },
  { name: 'npwp' },
  { name: 'po_number' },
  { name: 'bank_name' },
  { name: 'bank_account_number' },
  { name: 'bank_account_holder' },
  { name: 'subtotal', money: true },
  { name: 'tax_amount', money: true },
  { name: 'total_amount', money: true },
];

const CONFIDENCE_LABELS: Record<FieldConfidence, string> = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',
  manual: 'Manual',
};

const VERIFICATION_LABELS: Record<FieldVerification, string> = {
  verified: 'Terverifikasi',
  unverified: 'Belum terverifikasi',
  manual: 'Dikoreksi',
};

const VERIFICATION_VARIANTS: Record<FieldVerification, 'default' | 'outline' | 'secondary'> = {
  verified: 'default',
  unverified: 'outline',
  manual: 'secondary',
};

const signalText = (signal: boolean | null) =>
  signal === null ? 'tidak berlaku' : signal ? 'lolos' : 'gagal';

function VerificationBadge({ field }: { field: CheckedField<unknown> }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={VERIFICATION_VARIANTS[field.verification]} tabIndex={0}>
          {VERIFICATION_LABELS[field.verification]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>Ada di dokumen: {signalText(field.signals.grounded)}</p>
        <p>Format: {signalText(field.signals.format_ok)}</p>
        <p>Aritmetika: {signalText(field.signals.arithmetic_ok)}</p>
        <p>Keyakinan model: {CONFIDENCE_LABELS[field.confidence]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function toRequestValue(text: string, money: boolean | undefined) {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return money ? normalizeMoney(trimmed) : trimmed;
}

/** Evidence beside every value, and the correction form (product doc 6.4, 9.1). */
export function DocumentReview({
  documentId,
  pdfUrl,
  fields,
  editable,
  children,
}: {
  documentId: string;
  pdfUrl: string | null;
  fields: CheckedInvoice | null;
  editable: boolean;
  /** Shown under the fields, in the column beside the PDF. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Evidence[] | null>(null);
  const [edits, setEdits] = useState<Partial<Record<ScalarField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allEvidence = fields
    ? [...FIELDS.map(({ name }) => fields[name]), ...fields.line_items].flatMap((f) => f.evidence)
    : [];

  async function save(event: FormEvent) {
    event.preventDefault();
    const corrections: Record<string, string | number | null> = {};
    for (const { name, money } of FIELDS) {
      const text = edits[name];
      if (text === undefined) continue;
      const value = toRequestValue(text, money);
      if (money && text.trim() !== '' && value === null) {
        setError('Nominal tidak valid.');
        return;
      }
      corrections[name] = value;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrections }),
      });
      const result = await response.json();
      if (result.ok) {
        setEdits({});
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
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        {pdfUrl ? (
          <PdfViewer url={pdfUrl} highlights={selected ?? allEvidence} />
        ) : (
          <p className="text-muted-foreground text-sm">PDF tidak tersedia.</p>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        {fields && (
          <TooltipProvider>
            <form onSubmit={save} className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Nilai</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FIELDS.map(({ name }) => {
                    const field = fields[name];
                    const label = FIELD_LABELS[name];
                    const critical = (CRITICAL_EXTRACTION_FIELDS as readonly string[]).includes(name);
                    return (
                      <TableRow
                        key={name}
                        onMouseEnter={() => setSelected(field.evidence)}
                        onMouseLeave={() => setSelected(null)}
                      >
                        <TableCell>
                          {label}
                          {critical && (
                            <span className="text-destructive" title="Field kritis">
                              {' '}
                              *
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="space-y-1">
                          {editable ? (
                            <Input
                              aria-label={label}
                              value={edits[name] ?? String(field.value ?? '')}
                              onFocus={() => setSelected(field.evidence)}
                              onChange={(event) =>
                                setEdits((all) => ({ ...all, [name]: event.target.value }))
                              }
                            />
                          ) : (
                            <span>{String(field.value ?? '-')}</span>
                          )}
                          {field.value !== null && field.verification !== 'manual' && field.evidence.length === 0 && (
                            <p className="text-muted-foreground text-xs">Lokasi bukti tidak ditemukan</p>
                          )}
                          {field.verification === 'manual' && field.signals.grounded === false && (
                            <p className="text-destructive text-xs">{MANUAL_NOT_IN_DOCUMENT}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <VerificationBadge field={field} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {fields.line_items.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.line_items.map((line, index) => (
                      <TableRow
                        key={index}
                        onMouseEnter={() => setSelected(line.evidence)}
                        onMouseLeave={() => setSelected(null)}
                      >
                        <TableCell className="whitespace-normal">{line.value?.description}</TableCell>
                        <TableCell className="text-right">{line.value?.quantity}</TableCell>
                        <TableCell className="text-right">
                          {line.value?.unit_price.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className="text-right">
                          {line.value?.line_subtotal.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell>
                          <VerificationBadge field={line} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {error && (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              )}
              {editable && (
                <Button type="submit" disabled={busy || Object.keys(edits).length === 0}>
                  {busy ? 'Menyimpan…' : 'Simpan koreksi'}
                </Button>
              )}
            </form>
          </TooltipProvider>
        )}
        {children}
      </div>
    </div>
  );
}
