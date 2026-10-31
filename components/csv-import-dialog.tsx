'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CsvError } from '@/lib/csv/parse';

type Outcome =
  | { kind: 'success' }
  | { kind: 'error'; message: string; errors: CsvError[] };

export function CsvImportDialog({ title, endpoint }: { title: string; endpoint: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (result.ok) {
        setOutcome({ kind: 'success' });
        router.refresh();
      } else {
        setOutcome({
          kind: 'error',
          message: result.error.message,
          errors: result.error.details?.errors ?? [],
        });
      }
    } catch {
      setOutcome({ kind: 'error', message: 'Gagal menghubungi server.', errors: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setOutcome(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>{title}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Satu baris saja yang tidak valid akan menolak seluruh file.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <Input type="file" name="file" accept=".csv,text/csv" required aria-label="File CSV" />
          <Button type="submit" disabled={busy}>
            {busy ? 'Mengimpor…' : 'Impor'}
          </Button>
        </form>

        {outcome?.kind === 'success' && <p className="text-sm">Import berhasil.</p>}
        {outcome?.kind === 'error' && (
          <div className="space-y-2">
            <p className="text-destructive text-sm" role="alert">
              {outcome.message}
            </p>
            {outcome.errors.length > 0 && (
              <div className="max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Baris</TableHead>
                      <TableHead>Kolom</TableHead>
                      <TableHead>Alasan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outcome.errors.map((error, index) => (
                      <TableRow key={index}>
                        <TableCell>{error.row}</TableCell>
                        <TableCell>{error.column || '-'}</TableCell>
                        <TableCell>{error.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
