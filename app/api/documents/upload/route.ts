import { isPdf } from '@/lib/document-router/detect-file-type';
import { processDocument } from '@/lib/server/process-document';
import { fail, ok, withWriteContext } from '@/lib/server/write-context';
import { ROLES } from '@/types/domain';

// Extraction runs inside the request; there is no queue in the MVP.
export const maxDuration = 300;

// ponytail: Vercel rejects request bodies over about 4.5 MB. Upload straight to
// storage from the browser if real invoices run larger.
const MAX_UPLOAD_BYTES = 4_000_000;

// Every role may upload (product doc section 3).
export const POST = withWriteContext(ROLES, async (ctx, request: Request) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail(400, 'FILE_REQUIRED', 'Pilih file PDF.');
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(400, 'FILE_TOO_LARGE', 'Ukuran file maksimal 4 MB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) return fail(400, 'UNSUPPORTED_FILE_TYPE', 'Hanya file PDF yang didukung.');

  return ok(await processDocument(ctx, { bytes, filename: file.name }), 201);
});
