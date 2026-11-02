# FinRecon AI

**Lapisan kontrol sebelum pembayaran untuk tim Accounts Payable korporat di Indonesia.**

FinRecon membaca invoice vendor dengan LLM, lalu kode deterministik mengecek setiap nilai yang dibaca, mencocokkannya dengan purchase order dan master vendor, menolak pembayaran berisiko (rekening beda, vendor palsu, invoice dobel), dan menyerahkan kasus abu-abu ke manusia lewat review panel. Semua langkah tercatat di audit trail yang tidak bisa diubah.

> Prinsip utama: **LLM hanya membaca. Kode yang mengecek dan memutuskan. Manusia yang menyetujui.**

**Live demo:** [fin-recon-mvp.vercel.app](https://fin-recon-mvp.vercel.app). Berisi data sintetis saja, jadi jangan unggah invoice asli.

---

## Kenapa arsitekturnya begini

Di proses pembayaran, satu angka yang salah dibaca berarti uang terkirim ke tempat yang salah. Karena itu peran AI sengaja dibatasi:

| Zona | Folder | Boleh | Tidak boleh |
|---|---|---|---|
| **AI** | `lib/llm/`, `lib/agent/`, `lib/chatbot/` | Mengekstrak field invoice beserta kutipan sumbernya, menulis narasi dari data yang diberikan, menyusun draft email, menjawab pertanyaan dari hasil query | Menentukan status, skor, approve/reject, mengubah data vendor/rekening, mengirim email |
| **Deterministik** | `lib/document-router/`, `lib/extraction-checks/`, `lib/matching/`, `lib/review/`, `lib/followup-checks/`, `lib/email/`, `lib/audit.ts` | Semua keputusan | Meng-import kode zona AI atau memanggil LLM |

Konsekuensinya di kode:

- **Setiap nilai hasil LLM diverifikasi.** Nilainya harus benar-benar ada di teks PDF (`grounded`), formatnya valid (NPWP, rekening, tanggal), dan aritmetikanya cocok (subtotal + PPN = total). Field kritis yang gagal → dokumen ditahan di `NEEDS_CORRECTION`.
- **Bukti di samping jawaban.** Review panel menyorot lokasi setiap nilai di PDF, supaya reviewer melihat dokumen, bukan sekadar percaya AI.
- **Veto tidak bisa di-override siapa pun:** vendor tidak dikenal, vendor belum terverifikasi, rekening beda dari master, invoice dobel.
- **Gesekan sesuai risiko.** Invoice cocok dan nominal kecil = 1 klik. Nominal besar, tidak cocok, atau anomali = wajib centang bukti dan tulis alasan.
- **Pemisahan tugas.** Pengunggah invoice tidak boleh menyetujui invoice-nya sendiri; hanya approver yang boleh menandai PAID.
- **Agent follow-up tanpa tool kirim.** Agent hanya menyusun draft. Alamat tujuan selalu diambil dari master vendor, bukan dari invoice atau balasan vendor (mencegah penipuan email bisnis). Balasan vendor yang meminta ganti rekening ditandai sebagai sinyal penipuan dan tidak mengubah data apa pun.
- **Browser hanya bisa membaca.** Semua penulisan lewat API route yang mengecek sesi, role, dan aturan bisnis. Isolasi antar-perusahaan ditegakkan dengan Row Level Security.
- **Audit log append-only di level database**, termasuk terhadap service role.
- **Provider LLM bisa ditukar.** Kode aplikasi hanya memanggil `generateStructured()` dan `runToolLoop()`; SDK provider hanya ada di `lib/llm/providers/`. Saat ini memakai DeepSeek, dengan adapter Anthropic (Claude) yang sudah siap.

Spesifikasi lengkap: [`docs/product-doc.md`](docs/product-doc.md) · Keputusan desain (D1–D25): [`docs/decisions/`](docs/decisions/)

---

## Scope saat ini

Status: **MVP fungsional, belum production.** Dikerjakan per fase ([`docs/dev-guide.md`](docs/dev-guide.md)).

| Fitur | Status |
|---|---|
| Multi-tenant (organisasi), login, 3 peran: `admin`, `ap_staff`, `approver` | ✅ |
| Import master vendor & PO dari CSV dengan validasi per baris | ✅ |
| Upload invoice PDF → ekstraksi LLM → verifikasi deterministik → koreksi manual | ✅ |
| Matching engine: veto → skor 0–100 → klasifikasi → deteksi anomali | ✅ |
| Review panel dengan highlight bukti, gesekan sesuai risiko, pemisahan tugas | ✅ |
| Tandai PAID, narasi alasan (AI), halaman audit log + ekspor CSV | ✅ |
| Import histori invoice untuk baseline anomali | ✅ |
| Agent follow-up ke vendor (draft + kirim oleh manusia, mode `dry_run`) | ✅ |
| Chatbot read-only untuk approver/admin | ✅ |
| Eval harness lengkap (perbandingan model, kalibrasi, varian scan) | 🚧 Smoke test sudah ada; laporan lengkap belum |
| Polish UI, naskah demo, halaman kelola user | 🚧 |

**Angka yang sudah terukur** (data sintetis, jadi masih optimis):

- 764 unit/integration test lolos; coverage `lib/matching` dan `lib/review` 100%.
- Smoke test ekstraksi (10 invoice, DeepSeek Flash): 50/50 field kritis benar, 0 salah-tapi-terverifikasi, ±$0,0015 per invoice.
- Tes halusinasi chatbot: 28/30 benar, 2 menolak menjawab, **0 jawaban karangan**; 10/10 pertanyaan jebakan ditolak.

**Tidak termasuk MVP:** scan/foto invoice di aplikasi (ditolak sebagai `UNSUPPORTED_FORMAT`), eksekusi pembayaran, integrasi bank/ERP/Coretax, BAST/3-way matching, tagihan termin, kirim email sungguhan secara default.

---

## Tech stack

Next.js 16 (App Router) + TypeScript · Tailwind + shadcn/ui · Supabase (Postgres + RLS, Auth, Storage) · `pdfjs-dist` (teks + posisi) · Zod · PapaParse · DeepSeek API (adapter OpenAI-compatible) & Claude API (adapter Anthropic) · Resend (mode `dry_run`) · Vitest + Playwright · Python (reportlab) untuk generator invoice uji.

---

## Menjalankan secara lokal

### 1. Prasyarat

- Node.js 20+ dan npm
- Akun Supabase (gratis cukup), sebaiknya region Singapore
- API key DeepSeek (platform.deepseek.com). **Kirim hanya data sintetis/demo.**
- Opsional: Python 3.11+ untuk membangkitkan ulang invoice uji

### 2. Install & env

```bash
git clone <url-repo-ini> finrecon-ai && cd finrecon-ai
npm install
cp .env.example .env.local
```

Isi `.env.local`:

| Variabel | Isi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Idem. Hanya untuk server, jangan pernah dipakai di client |
| `LLM_PROVIDER` | `deepseek` |
| `DEEPSEEK_API_KEY` | API key DeepSeek |
| `ANTHROPIC_API_KEY` | Opsional, untuk adapter Claude |
| `EMAIL_MODE` | `dry_run` (email disimpan, tidak dikirim) |

### 3. Database

Di Supabase Dashboard:

1. **SQL Editor** → jalankan **semua file di [`supabase/migrations/`](supabase/migrations/) berurutan sesuai nomor**, masing-masing sekali.
2. **Authentication → Users → Add user**, centang **Auto Confirm User**, buat tiga akun uji di bawah. Password bebas (minimal 6 karakter); untuk lokal boleh pakai satu password yang sama.
3. **SQL Editor** → jalankan [`supabase/seed.sql`](supabase/seed.sql). Ini membuat organisasi **Demo Corp** dan menautkan ketiga akun ke perannya.

### 4. Jalankan

```bash
npm run dev
```

Buka `http://localhost:3000` dan login.

### 5. Isi data demo

Login sebagai **admin**, lalu import dari folder [`fixtures/`](fixtures/README.md):

1. Halaman **Vendors** → import `fixtures/vendors.csv`
2. Halaman **Purchase Orders** → import `fixtures/purchase_orders.csv`
3. Import histori → `fixtures/invoice_history.csv` (baseline deteksi anomali)

Invoice uji ada di `fixtures/invoices/`. Upload sebagai **ap_staff**, putuskan sebagai **approver**.

---

## Akun uji

Dibuat sendiri di langkah 3 (Database). Password ditentukan saat membuat akun, **tidak disimpan di repo ini.**

| Email | Peran | Untuk mencoba |
|---|---|---|
| `admin@democorp.test` | admin | Import CSV vendor/PO/histori, audit log, chatbot |
| `ap_staff@democorp.test` | ap_staff | Upload invoice, koreksi field, buat & kirim draft follow-up |
| `approver@democorp.test` | approver | Review & approve/reject, tandai PAID, chatbot |

Untuk mencoba isolasi antar-perusahaan, buat organisasi kedua beserta satu user lewat SQL Editor; user itu tidak akan melihat data Demo Corp.

## Skenario demo singkat

| Invoice (`fixtures/invoices/`) | Login sebagai | Yang terjadi |
|---|---|---|
| `01_…` invoice cocok | ap_staff upload → approver | `FULL_MATCH`, approve 1 klik, tandai PAID |
| `01_…` di-upload lagi | ap_staff | `REJECTED` — invoice dobel |
| `03_…` rekening beda | ap_staff | `REJECTED` — rekening tidak cocok master; tidak ada tombol approve |
| `02_…` harga +3% | approver | `PARTIAL_MATCH` (skor ±66) — wajib centang + alasan |
| `04_…` nomor invoice kosong | ap_staff | `NEEDS_CORRECTION` → isi manual → lanjut matching |
| `06_…` nominal 8× rata-rata | approver | Ditandai anomali, wajib alasan ≥ 20 karakter |
| `09_…` vendor palsu | ap_staff | `REJECTED` — vendor tidak ditemukan |
| `10_…` hasil scan | ap_staff | `UNSUPPORTED_FORMAT` |
| Upload sebagai ap_staff lalu coba approve sendiri | ap_staff | Ditolak (pemisahan tugas) |

Daftar lengkap 15 skenario: [`docs/product-doc.md`](docs/product-doc.md) bagian 18.

---

## Pengujian

```bash
npm test            # unit + integrasi RLS (butuh .env.local terisi; di-skip kalau kosong)
npm run typecheck
npm run lint
npm run build
npm run eval:smoke  # 10 invoice sintetis lewat LLM sungguhan, ±$0,02
npm run test:e2e    # Playwright + LLM sungguhan, pakai organisasi uji terpisah
```

Tes yang menulis data memakai organisasi `RLS Audit Fixture (do not delete)`, tidak pernah Demo Corp. Organisasi itu permanen karena baris audit memang tidak bisa dihapus.

Cek manual bahwa audit log append-only (keduanya harus gagal):

```sql
update audit_logs set reason = 'x';
delete from audit_logs;
```

---

## Struktur

```
app/                    Halaman (dashboard) & API routes
lib/document-router/    Baca PDF + posisi teks              (deterministik)
lib/extraction-checks/  grounded / format / aritmetika      (deterministik)
lib/matching/           Veto, skor, klasifikasi, anomali     (deterministik)
lib/review/             Item wajib review, validasi keputusan (deterministik)
lib/followup-checks/    Deteksi permintaan ganti rekening    (deterministik)
lib/email/              Transport email (dry_run / Resend)   (deterministik)
lib/llm/                Interface LLM + adapter provider     (AI)
lib/agent/              Agent follow-up                      (AI)
lib/chatbot/            Chatbot read-only                    (AI)
lib/server/             Satu-satunya jalur tulis (sesi + role + service role)
supabase/migrations/    Skema, RLS, audit append-only
fixtures/               CSV master data, invoice PDF uji + ground truth
eval/                   Generator invoice sintetis (Python)
docs/                   Spesifikasi, decision log, panduan pengerjaan
```

---

## Catatan

- Data di repo ini sepenuhnya **sintetis**. Jangan mengirim invoice klien sungguhan ke provider LLM mana pun tanpa keputusan soal lokasi pemrosesan data.
- Angka akurasi di atas diukur pada PDF sintetis yang rapi; angka nyata akan lebih rendah dan perlu diukur ulang dengan dokumen asli.
- Dikembangkan dengan bantuan Claude Code, dengan spesifikasi, keputusan desain, dan review kode bagian kritis dilakukan sendiri.