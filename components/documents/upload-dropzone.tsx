'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type DragEvent } from 'react';
import { Input } from '@/components/ui/input';

const POLL_MS = 3000;

/** The page re-reads the table while anything is being processed, here or in another tab. */
export function UploadDropzone({ processing }: { processing: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!busy && !processing) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [busy, processing, router]);

  async function upload(files: File[]) {
    setBusy(true);
    setErrors([]);
    for (const file of files) {
      const body = new FormData();
      body.append('file', file);
      try {
        const response = await fetch('/api/documents/upload', { method: 'POST', body });
        const result = await response.json();
        if (!result.ok) setErrors((all) => [...all, `${file.name}: ${result.error.message}`]);
      } catch {
        setErrors((all) => [...all, `${file.name}: gagal menghubungi server.`]);
      }
      router.refresh();
    }
    setBusy(false);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!busy) void upload([...event.dataTransfer.files]);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`space-y-2 rounded-lg border border-dashed p-6 text-center ${dragging ? 'bg-muted' : ''}`}
      >
        <p className="text-muted-foreground text-sm">
          {busy ? 'Mengunggah dan mengekstraksi…' : 'Tarik PDF invoice ke sini, atau pilih file.'}
        </p>
        <Input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy}
          aria-label="File PDF invoice"
          className="mx-auto max-w-xs"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length > 0) void upload(files);
          }}
        />
      </div>
      {errors.map((message) => (
        <p key={message} className="text-destructive text-sm" role="alert">
          {message}
        </p>
      ))}
    </div>
  );
}
