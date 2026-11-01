'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import type { Evidence } from '@/lib/extraction-checks';

function PdfPage({
  pdf,
  number,
  width,
  boxes,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  boxes: Evidence[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useEffect(() => {
    let cancel = () => {};
    let stopped = false;
    void pdf.getPage(number).then((page) => {
      if (stopped || !canvas.current) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = width / natural.width;
      // The canvas holds device pixels and CSS shrinks it, which keeps text sharp.
      const viewport = page.getViewport({ scale: scale * window.devicePixelRatio });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      setFit({ scale, height: natural.height * scale });
      const task = page.render({ canvas: canvas.current, viewport });
      cancel = () => task.cancel();
      task.promise.catch(() => {});
    });
    return () => {
      stopped = true;
      cancel();
    };
  }, [pdf, number, width]);

  return (
    <div className="relative" style={{ width, height: fit?.height }}>
      <canvas ref={canvas} className="block size-full border" aria-label={`Halaman ${number}`} />
      {fit &&
        boxes.map(({ bbox }, index) => (
          <div
            key={index}
            aria-hidden
            className="absolute rounded-sm bg-yellow-300/40 ring-2 ring-yellow-500"
            style={{
              left: bbox.x * fit.scale,
              top: bbox.y * fit.scale,
              width: bbox.width * fit.scale,
              height: bbox.height * fit.scale,
            }}
          />
        ))}
    </div>
  );
}

/** Renders every page in the browser and highlights the evidence it is given. */
export function PdfViewer({ url, highlights }: { url: string; highlights: Evidence[] }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Pages fit the column, so no amount at the right edge is ever off screen.
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let stopped = false;
    async function load() {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const loaded = await pdfjs.getDocument({ url }).promise;
      if (!stopped) setPdf(loaded);
    }
    load().catch(() => setFailed(true));
    return () => {
      stopped = true;
    };
  }, [url]);

  return (
    <div ref={container} className="min-w-0 space-y-4">
      {failed && (
        <p className="text-destructive text-sm" role="alert">
          Gagal menampilkan PDF.
        </p>
      )}
      {!failed && !pdf && <p className="text-muted-foreground text-sm">Memuat PDF…</p>}
      {pdf &&
        width > 0 &&
        Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((number) => (
          <PdfPage
            key={number}
            pdf={pdf}
            number={number}
            width={width}
            boxes={highlights.filter((box) => box.page === number)}
          />
        ))}
    </div>
  );
}
