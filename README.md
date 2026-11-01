# FinRecon AI

Lapisan kontrol pra-pembayaran untuk Accounts Payable korporat (Indonesia).
LLM hanya membaca dokumen; kode deterministik mengecek bacaannya dan mengambil
semua keputusan finansial. Aturan lengkap ada di [`CLAUDE.md`](CLAUDE.md).

Urutan sumber kebenaran:

1. Decision log: [`docs/decisions/2026-10-31-v3.md`](docs/decisions/2026-10-31-v3.md)
2. Spesifikasi produk v3: [`docs/product-doc.md`](docs/product-doc.md)
3. [`CLAUDE.md`](CLAUDE.md)

Lainnya:

- Rencana kerja per sesi: [`docs/dev-guide.md`](docs/dev-guide.md)
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
| `LLM_PROVIDER` | `deepseek` (default) atau `anthropic` (D23) |
| `DEEPSEEK_API_KEY` | platform.deepseek.com/api_keys, provider aktif. **Hanya data sintetis/demo** (D23) |
| `ANTHROPIC_API_KEY` | console.anthropic.com, untuk jalur vision dan perbandingan eval |
| `EMAIL_MODE` | `dry_run` (default) atau `resend` (dipakai Fase 7) |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend.com, hanya kalau `EMAIL_MODE=resend` |

Di Vercel staging, Fase 2 hanya butuh tiga variabel Supabase; sisanya ditambahkan
saat fase pemakainya selesai. `vercel.json` tidak diperlukan: batas waktu route
diatur dengan `export const maxDuration` di route-nya.

## Database

Migration dijalankan manual di Supabase Dashboard. CLI hanya dipakai untuk
generate types, karena `0001` diterapkan manual sehingga `db push` akan
menjalankannya ulang.

1. **SQL Editor** → jalankan isi
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), lalu
   [`0002_v3.sql`](supabase/migrations/0002_v3.sql) dan
   [`0003_d22.sql`](supabase/migrations/0003_d22.sql). Berurutan, masing-masing sekali.
2. **Authentication → Users → Add user** ×3 dengan "Auto Confirm User"
   aktif: `admin@democorp.test`, `ap_staff@democorp.test`,
   `approver@democorp.test`. Email tidak perlu asli; password minimal 6
   karakter (aturan Supabase).
3. **SQL Editor** → jalankan [`supabase/seed.sql`](supabase/seed.sql).
   Membuat organisasi "Demo Corp" dan menautkan ketiga user ke profil beserta
   perannya. Aman dijalankan ulang.

Setelah skema berubah, generate ulang types (sekali `npx supabase login` dulu):

```bash
npm run db:types
```

**Hak akses (D21):** role `anon` dan `authenticated` hanya baca. Semua penulisan
lewat API route yang dibungkus `withWriteContext` di
[`lib/server/write-context.ts`](lib/server/write-context.ts). User tidak pernah
dihapus, hanya dinonaktifkan lewat `profiles.deactivated_at`.

## Uji

```bash
npm test        # unit test + test integrasi RLS (butuh .env.local terisi)
npm run typecheck
npm run lint
npm run build
```

`tests/rls.integration.test.ts` memakai project Supabase asli untuk membuktikan
isolasi antar-organisasi dan bahwa anon key tidak bisa menulis ke tabel mana pun.
Tes yang menulis data memakai organisasi `RLS Audit Fixture (do not delete)`,
tidak pernah Demo Corp. Organisasi itu sengaja permanen karena baris audit tidak
bisa dihapus. Tes integrasi otomatis di-skip kalau env belum terisi.

Cek manual append-only `audit_logs` di SQL Editor (harus gagal keduanya):

```sql
update audit_logs set reason = 'x';
delete from audit_logs;
```

## Arsitektur singkat

| Folder | Zona | Isi |
|---|---|---|
| `lib/document-router/`, `lib/extraction-checks/`, `lib/matching/`, `lib/review/`, `lib/followup-checks/`, `lib/email/` | Deterministik | Pembacaan PDF, pengecekan ekstraksi, matching, review, deteksi ganti rekening, transport email (Fase 3-7) |
| `lib/llm/`, `lib/agent/`, `lib/chatbot/` | AI | Ekstraksi, narasi, agent follow-up, chatbot (Fase 3, 5, 7, 8) |
| `lib/supabase/` | — | `client` (browser), `server` (per-request), `admin` (service role, bypass RLS) |
| `lib/auth.ts` | — | `getSessionContext()` — satu-satunya sumber `organization_id` |
| `lib/server/write-context.ts` | Deterministik | Satu-satunya jalur tulis: sesi, role, lalu service role (D21) |
| `lib/audit.ts` | Deterministik | `logAudit()` ke `audit_logs` yang append-only |
| `lib/csv/` | — | Validasi file CSV vendor dan PO |

`proxy.ts` di root menyegarkan sesi Supabase dan menendang anonim ke `/login`.
Di Next.js 16 nama file `middleware.ts` sudah deprecated.

## Status fase

Rencana v3 (D14). Vercel staging menunggu perintah manual di bawah.

- [x] **Fase 0** — repo, dokumen, `docs/llm-context/`, fixtures, `.env.example`
- [x] **Fase 1** — skeleton Next.js, migration + RLS, auth, layout dashboard
- [x] **Fase 1b** — tutup Fase 1: Supabase pulih, shadcn Form, generate types, tes RLS hijau, migration 0002, D21
- [x] **Fase 2** — master data (vendor & PO, `contact_email`)
- [x] **Fase 3** — upload → ekstraksi → extraction checks → koreksi, generator v1
- [x] **Fase 4** — matching engine (test-first)
- [ ] Fase 5 — review panel, gesekan sesuai risiko, SoD, PAID, narasi, audit log (checkpoint demo BizDev)
- [ ] Fase 6 — eval harness (checkpoint portofolio)
- [ ] Fase 7 — agent follow-up
- [ ] Fase 8 — baseline anomali & chatbot
- [ ] Fase 9 — polish & demo
