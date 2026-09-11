# FinRecon AI

Lapisan kontrol pra-pembayaran untuk Accounts Payable korporat (Indonesia).
LLM hanya membaca dokumen; semua keputusan finansial diambil kode
deterministik. Aturan lengkap ada di [`CLAUDE.md`](CLAUDE.md).

- Spesifikasi produk: [`docs/product-doc-v2.md`](docs/product-doc-v2.md)
- Rencana per fase: [`docs/dev-guide.md`](docs/dev-guide.md)
- Referensi API untuk Claude Code: [`docs/llm-context/`](docs/llm-context/)
- Data uji: [`fixtures/`](fixtures/README.md)

## Setup

```bash
cp .env.example .env.local   # isi keduanya, .env.local tidak di-commit
npm install
npm run dev
```

| Variabel | Dari mana |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (server-only, jangan pernah dipakai di client) |
| `ANTHROPIC_API_KEY` | console.anthropic.com (baru dipakai Fase 3) |

## Database

Tanpa Supabase CLI — semua lewat Supabase Dashboard:

1. **SQL Editor** → jalankan isi
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   Migration berikutnya (`0002_…`) juga dijalankan manual dengan cara yang
   sama, berurutan, masing-masing sekali.
2. **Authentication → Users → Add user** ×3 dengan "Auto Confirm User"
   aktif: `admin@democorp.test`, `ap_staff@democorp.test`,
   `approver@democorp.test`. Email tidak perlu asli; password minimal 6
   karakter (aturan Supabase).
3. **SQL Editor** → jalankan [`supabase/seed.sql`](supabase/seed.sql).
   Membuat organisasi "Demo Corp" dan menautkan ketiga user ke profil beserta
   perannya. Aman dijalankan ulang.

`types/database.types.ts` belum di-generate; klien Supabase belum memakai
generik `<Database>`. Tambahkan saat query mulai banyak (Fase 2+).

## Uji

```bash
npm test        # unit test + test integrasi RLS (butuh .env.local terisi)
npm run lint
npm run build
```

`tests/rls.integration.test.ts` membuat dua organisasi sementara di project
Supabase asli, membuktikan user org B tidak melihat data org A, lalu
membersihkannya. Test ini otomatis di-skip kalau env belum terisi.

Cek manual append-only `audit_logs` di SQL Editor (harus gagal keduanya):

```sql
update audit_logs set reason = 'x';
delete from audit_logs;
```

## Arsitektur singkat

| Folder | Zona | Isi |
|---|---|---|
| `lib/matching/`, `lib/document-router/` | Deterministik | Semua keputusan finansial (Fase 3-4) |
| `lib/llm/`, `lib/chatbot/` | AI | Ekstraksi, narasi, chatbot (Fase 3, 5, 6) |
| `lib/supabase/` | — | `client` (browser), `server` (per-request), `admin` (service role, bypass RLS) |
| `lib/auth.ts` | — | `getSessionContext()` — satu-satunya sumber `organization_id` |

`proxy.ts` di root menyegarkan sesi Supabase dan menendang anonim ke `/login`.
Di Next.js 16 nama file `middleware.ts` sudah deprecated.

## Status fase

- [x] **Fase 0** — repo, dokumen, `docs/llm-context/`, fixtures, `.env.example`
- [x] **Fase 1** — skeleton Next.js, migration + RLS, auth, layout dashboard
- [ ] Fase 2 — master data (vendor & PO)
- [ ] Fase 3 — upload → ekstraksi → koreksi
- [ ] Fase 4 — matching engine (test-first)
- [ ] Fase 5 — review panel, PAID, narasi, audit log
- [ ] Fase 6 — baseline anomali & chatbot
- [ ] Fase 7 — polish demo
