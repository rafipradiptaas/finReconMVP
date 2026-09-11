# FinRecon AI — Dokumen Perancangan Produk (Versi 2)

**Sistem Verifikasi Pembayaran Cerdas Berbasis AI — Modul Accounts Payable**
Disusun untuk Tim FinRecon AI · September 2026 · Menggantikan Dokumen Final 28 Juli 2026

---

## Catatan Perubahan dari Versi Final (28 Juli 2026)

Versi ini mempertahankan seluruh prinsip arsitektur (Zona AI vs Zona Deterministik) dan mengganti bagian yang sebelumnya masih ambigu dengan keputusan tegas:

| Area | Sebelumnya | Sekarang |
|---|---|---|
| Sumber PO | Belum ditentukan | Import CSV standar (bukan ekstraksi PDF) |
| BAST | Disebut di matching 3-arah | Ditunda ke Fase 2; MVP matching invoice ↔ PO ↔ master vendor |
| Status match | Hanya PARTIAL_MATCH & ANOMALY disebut | Enum lengkap + bobot skor + threshold didefinisikan |
| Override | "approve/reject/override" tanpa batas | Hard-rule veto **tidak** bisa di-override; override hanya untuk non-veto |
| Format dokumen | Semua jenis | MVP: PDF ber-teks saja; scan/foto (vision) Fase 2 |
| Confidence rendah | Belum diatur | Field kritis low-confidence → `NEEDS_CORRECTION`, koreksi manual |
| Alasan reject | Belum diatur | LLM menyusun narasi dari kode veto + data pembanding |
| Peran | 8 peran | MVP: `admin`, `ap_staff`, `approver` (semua approver setara) |
| Status "dibayar" | Belum diatur | Approver menandai manual `PAID` → mengaktifkan deteksi duplikat |
| Chatbot | Masuk MVP, "untuk ditinjau" | Masuk MVP, dikerjakan **fase terakhir**, akses approver & admin |
| Data historis | Belum ada | Dataset dummy dari consulting firm BizDev (format ditentukan) |
| Region | Belum ditentukan | Supabase Singapore (ap-southeast-1) |
| Vendor "verified" | Belum jelas siapa | Manusia (staff terkait) menetapkan; sistem hanya memberi indikator |

---

## 1. Ringkasan Produk

FinRecon AI adalah B2B SaaS **lapisan kontrol sebelum pembayaran** untuk modul Accounts Payable korporat. Sistem membaca invoice vendor secara otomatis (AI), mencocokkannya dengan PO dan master data vendor (kode deterministik), menolak otomatis kondisi berisiko (rekening tidak cocok, invoice duplikat, vendor belum terverifikasi), dan menyerahkan kasus abu-abu ke manusia lewat review panel — dengan audit trail permanen untuk setiap keputusan.

### Masalah yang Diselesaikan

Proses pembayaran korporat masih: verifikasi dokumen 100% manual (30-45 menit per pembayaran), tidak ada pengaman otomatis di gerbang pembayaran, data vendor tidak divalidasi ulang, dan tidak ada alarm untuk transaksi mencurigakan. Akibatnya: risiko bayar dua kali, bayar ke rekening salah, bayar ke vendor palsu.

### Tujuan Terukur

- Kesalahan pembayaran (dikoreksi/dibatalkan) < 0,1% dari total transaksi
- Waktu verifikasi per pembayaran turun dari 30-45 menit ke 5-10 menit
- 100% pembayaran melewati verifikasi; 0 pembayaran tanpa verifikasi
- Semua keputusan tercatat di audit trail yang tidak bisa diubah

### Posisi Produk (Penting untuk Pitching)

FinRecon AI **tidak** mengeksekusi pembayaran dan **tidak** terhubung ke bank/ERP di MVP. Outputnya adalah status "layak bayar" yang terverifikasi + jejak audit. Narasi ke klien: *"AI-nya hanya membaca dokumen. Yang memutuskan uang boleh keluar atau tidak adalah aturan yang bisa diaudit."*

### Target Klien & Model Bisnis

- Tim Finance/AP, Procurement, dan Manajemen di perusahaan menengah-besar dengan volume invoice vendor tinggi
- Retainer bulanan: estimasi Rp 15-40 juta/bulan tergantung volume
- Go-to-market: BizDev (jaringan korporat) langsung ke CFO / Finance Director

---

## 2. Prinsip Arsitektur Inti: Zona AI vs Zona Deterministik

AI/LLM **hanya** untuk tugas interpretatif. Semua keputusan finansial dijalankan kode deterministik yang reproducible dan bisa diaudit.

```
+---------------------------------------------------------------+
| ZONA AI (boleh reasoning/generative, toleran variasi)         |
+---------------------------------------------------------------+
| - Ekstraksi field dari PDF invoice (structured output)        |
| - Confidence per field (low/medium/high)                      |
| - Narasi alasan reject/flag (input: kode veto + data          |
|   pembanding dari kode; LLM hanya merangkai kalimat)          |
| - Chatbot Q&A read-only (grounded ke hasil tool call)         |
+---------------------------------------------------------------+
                     | data mengalir SATU ARAH
                     v
+---------------------------------------------------------------+
| ZONA DETERMINISTIK (kode biasa, TIDAK boleh AI)               |
+---------------------------------------------------------------+
| - Document router (deteksi tipe file, cek text layer)         |
| - Hard-rule veto (vendor, rekening, duplikat)                  |
| - Skor kecocokan (field comparison + similarity)              |
| - Klasifikasi status match (threshold)                        |
| - Deteksi anomali (statistik historis)                        |
| - Otorisasi peran & keputusan review                          |
| - Audit trail (append-only, ditegakkan di database)           |
+---------------------------------------------------------------+
```

### Aturan yang Tidak Boleh Dilanggar

1. Zona AI boleh **membaca** hasil Zona Deterministik. Zona AI **tidak boleh menulis** ke keputusan final (status match, approve/reject, status paid).
2. Kode di `lib/matching/` dan `lib/document-router/` tidak boleh meng-import apa pun dari `lib/llm/` atau `lib/chatbot/`.
3. Angka, nomor rekening, nama vendor di narasi LLM selalu **dikutip dari data terverifikasi** yang dikirim sebagai input — bukan hasil generate.
4. Kalau LLM gagal (timeout, error, output tidak valid), keputusan deterministik tetap sah. Narasi hanya pelengkap.
5. `organization_id` untuk semua query (termasuk tool chatbot) di-inject dari session server, **tidak pernah** dari argumen yang diisi LLM.

### Koreksi terhadap BRD Asli

| Frasa di BRD | Risiko Jika Harfiah | Implementasi |
|---|---|---|
| "AI memberikan skor kecocokan" | LLM jadi hakim — non-reproducible | Skor dihitung formula (Bagian 6). LLM tidak terlibat. |
| "AI mencocokkan data dengan dokumen asli" | LLM penentu cocok/tidak | LLM mengekstrak; kode membandingkan. |
| "AI menganalisis pola abnormal" | Definisi "anomali" implisit di LLM | Threshold statistik di kode. LLM membungkus jadi narasi. |
| "AI membuat ringkasan sebelum pembayaran" | Salah kutip angka | Template terstruktur diisi dari data; LLM merapikan bahasa. |
| "AI memverifikasi foto asli vs editan" | Belum matang | Bukan hard-rule; paling banter sinyal tambahan. Ditunda. |

---

## 3. Peran & Otorisasi (MVP)

| Peran | Boleh | Tidak Boleh |
|---|---|---|
| `admin` | Semua di bawah + kelola user, import CSV vendor & PO, akses chatbot | — |
| `ap_staff` | Upload invoice, koreksi field ekstraksi, lihat dashboard & match, review panel (approve/reject/override non-veto) | Menandai PAID, akses chatbot, import CSV |
| `approver` | Semua yang `ap_staff` boleh + menandai invoice `PAID`, akses chatbot | Import CSV, kelola user |

- Semua approver setara (tidak ada batas nominal / delegation of authority di MVP).
- Vendor ditetapkan **"verified" oleh manusia** (`admin` atau `ap_staff`), bukan oleh sistem. Sistem hanya menampilkan **indikator kesiapan vendor** (Bagian 5).
- SoD penuh (pembuat vendor ≠ pembayar, dst.) ditunda ke Fase 2. Yang sudah ada di MVP: pemisahan `ap_staff` (proses) vs `approver` (tandai bayar).

---

## 4. Alur Proses MVP (End-to-End)

```
[admin] Import master vendor (CSV)  ─┐
[admin] Import PO (CSV)              ─┤
                                     v
[ap_staff] Upload invoice PDF ──> Document Router ──> Ekstraksi (LLM)
                                                          |
                                     field kritis low-confidence?
                                       ya ──> NEEDS_CORRECTION ──> [ap_staff] koreksi manual ──┐
                                       tidak ─────────────────────────────────────────────────┤
                                                                                              v
                                                                        Matching Engine (deterministik)
                                                                        1. Hard-rule veto
                                                                        2. Skor kecocokan
                                                                        3. Klasifikasi + cek anomali
                                                                                              |
                          ┌───────────────────┬─────────────────────┬─────────────────────────┤
                          v                   v                     v                         v
                      REJECTED           FULL_MATCH        PARTIAL_MATCH / NO_MATCH        ANOMALY
                    (tidak bisa        (langsung ke         (wajib review panel)        (wajib review panel)
                     di-override)      approval)                    |                         |
                          |                   |                     └──────────┬──────────────┘
                     investigasi              |                                v
                     (catatan saja)           |                     [ap_staff/approver] approve / reject / override (+alasan)
                                              v                                |
                                        APPROVED (siap bayar) <────────────────┘
                                              |
                                  [approver] Tandai PAID (manual)
                                              |
                                              v
                              Invoice masuk histori → dipakai deteksi duplikat & baseline anomali
```

Setiap panah yang mengubah status menulis satu baris ke `audit_logs`.

---

## 5. Master Data & Format Import

### 5.1 Master Vendor — `vendors.csv`

| Kolom | Tipe | Wajib | Catatan |
|---|---|---|---|
| `vendor_code` | string | ya | Unik per organisasi |
| `vendor_name` | string | ya | Nama legal |
| `npwp` | string | ya | 15/16 digit, disimpan tanpa tanda baca |
| `bank_name` | string | ya | Dinormalisasi ke daftar bank (BCA, Mandiri, BNI, BRI, …) |
| `bank_account_number` | string | ya | Digit saja |
| `bank_account_holder` | string | ya | Sesuai buku tabungan |
| `status` | enum | ya | `verified` / `unverified` / `suspended` |
| `last_verified_at` | date | tidak | ISO 8601; kosong = belum pernah |

Import: validasi tiap baris (format NPWP, digit rekening, enum status), tolak file jika ada baris invalid, tampilkan nomor baris + alasannya. Import ulang dengan `vendor_code` yang sama = update (upsert), dicatat di audit.

### 5.2 Purchase Order — `purchase_orders.csv`

Satu baris per **line item**; baris dengan `po_number` sama digabung jadi satu PO.

| Kolom | Tipe | Wajib |
|---|---|---|
| `po_number` | string | ya |
| `vendor_code` | string | ya (harus ada di master vendor) |
| `po_date` | date | ya |
| `line_no` | int | ya |
| `item_description` | string | ya |
| `quantity` | number | ya |
| `unit_price` | number | ya |
| `currency` | string | tidak (default `IDR`) |

`total_amount` PO dihitung sistem dari Σ(quantity × unit_price), tidak diimpor.

### 5.3 Indikator Kesiapan Vendor (ditampilkan, bukan diputuskan sistem)

| Indikator | Kondisi |
|---|---|
| **Aman** | `status = verified`, semua field lengkap, `last_verified_at` ≤ 12 bulan |
| **Perlu Review** | `status = verified` tapi `last_verified_at` > 12 bulan atau kosong (BR-12) |
| **Belum Siap** | `status ≠ verified` atau ada field bank/NPWP kosong |

Manusia yang memutuskan mengubah `status`. Perubahan `status` dan field bank dicatat di audit dengan nilai lama → baru.

---

## 6. Ekstraksi Dokumen (Zona AI)

### 6.1 Ruang Lingkup MVP

- **Hanya PDF ber-teks** (text layer terdeteksi oleh document router). PDF hasil scan/foto → status `UNSUPPORTED_FORMAT` dengan pesan jelas. Vision LLM masuk Fase 2.
- Satu tipe dokumen: **invoice vendor**.

### 6.2 Skema Output Ekstraksi

Setiap field punya `value` dan `confidence` (`high` / `medium` / `low`). Field kosong = `value: null, confidence: low`.

| Field | Kelompok | Target akurasi |
|---|---|---|
| `invoice_number` | kritis | ≥ 98% |
| `total_amount` | kritis | ≥ 98% |
| `bank_account_number` | kritis | ≥ 98% |
| `npwp` | kritis | ≥ 98% |
| `vendor_name` | non-kritis | ≥ 95% |
| `invoice_date` | non-kritis | ≥ 95% |
| `po_number` | non-kritis | ≥ 95% |
| `bank_name`, `bank_account_holder` | non-kritis | ≥ 95% |
| `line_items[]` (description, qty, unit_price, subtotal) | non-kritis | ≥ 90% |

Diukur terhadap minimal 20 sampel invoice dengan ground truth. Kalau field kritis di bawah target → perbaiki prompt/skema, **bukan** turunkan target.

### 6.3 Aturan Confidence

- Ada field **kritis** dengan `confidence = low` atau `null` → dokumen berhenti di `NEEDS_CORRECTION`. Tidak masuk matching sampai `ap_staff` mengisi/memperbaiki.
- Field **non-kritis** `low` → tetap lanjut matching; ditampilkan sebagai warning di review panel.
- Koreksi manual menyimpan nilai lama, nilai baru, siapa, kapan → `audit_logs`. Field yang dikoreksi manusia diberi `confidence = manual`.

---

## 7. Matching Engine (Zona Deterministik)

Urutan wajib: **veto → skor → klasifikasi → anomali**. Semua angka threshold di satu file `lib/matching/config.ts`.

### 7.1 Lapis 1 — Hard-Rule Veto

Dicek sebelum skor. Satu kena → `REJECTED`, skor tidak dihitung, tidak bisa di-override.

| Kode veto | Aturan | BR |
|---|---|---|
| `VETO_VENDOR_NOT_FOUND` | NPWP atau nama vendor tidak cocok ke satu vendor mana pun di master | BR-01 |
| `VETO_VENDOR_NOT_VERIFIED` | Vendor ditemukan tapi `status ≠ verified` | BR-01 |
| `VETO_BANK_MISMATCH` | `bank_account_number` / `bank_name` / `bank_account_holder` ≠ master (exact setelah normalisasi: hapus spasi & tanda baca, uppercase) | BR-03 |
| `VETO_DUPLICATE_INVOICE` | Sudah ada invoice dengan `invoice_number` + `vendor_id` sama berstatus `APPROVED` atau `PAID` | BR-04 |

Identifikasi vendor: cari dulu by NPWP (exact); kalau tidak ada, by `vendor_name` similarity ≥ 0,95; kalau tetap tidak ada → `VETO_VENDOR_NOT_FOUND`.

### 7.2 Lapis 2 — Skor Kecocokan (0-100)

Hanya dihitung jika lolos veto.

| Komponen | Bobot | Cara hitung |
|---|---|---|
| `po_number` cocok | 25 | exact setelah normalisasi; 0 jika PO tidak ditemukan atau vendor PO ≠ vendor invoice |
| `vendor_name` | 15 | Jaro-Winkler similarity (0-1) × 15 |
| `total_amount` vs total PO | 25 | selisih ≤ 0,5% → 25; linear turun ke 0 pada selisih 5%; > 5% → 0 |
| Line item | 20 | (jumlah baris invoice yang cocok qty & unit_price dengan baris PO) / (jumlah baris invoice) × 20. Cocok = description similarity ≥ 0,8 **dan** qty sama **dan** unit_price selisih ≤ 0,5% |
| Kelengkapan & konsistensi internal | 15 | Σ line subtotal = total_amount (±0,5%) → 10; `invoice_date` ≥ `po_date` → 5 |

Catatan: bobot BAST (qty diterima) ditambahkan di Fase 2 dan dikurangkan dari komponen line item.

### 7.3 Lapis 3 — Klasifikasi

| Status | Kondisi | Aksi |
|---|---|---|
| `REJECTED` | Kena veto | Tidak bisa di-override. Hanya bisa diberi catatan investigasi. |
| `FULL_MATCH` | Skor ≥ 90 | Langsung ke `APPROVED` setelah satu klik approve oleh `ap_staff`/`approver` |
| `PARTIAL_MATCH` | 60 ≤ skor < 90 | Wajib review panel |
| `NO_MATCH` | Skor < 60 **atau** PO tidak ditemukan | Wajib review panel; kemungkinan butuh dokumen ulang |

### 7.4 Lapis 4 — Anomali (dicek terpisah, bisa menempel ke status apa pun kecuali `REJECTED`)

```
IF vendor punya ≥ 6 invoice PAID dalam 24 bulan terakhir:
    flag ANOMALY jika total_amount > mean(histori) × 3
ELSE (vendor baru / histori tipis):
    flag ANOMALY jika total_amount > ANOMALY_ABSOLUTE_THRESHOLD (default Rp 500.000.000)
```

Invoice dengan flag `ANOMALY` **selalu** masuk review panel meskipun skornya `FULL_MATCH`. Threshold `3` dan angka absolut ada di `config.ts` dan **wajib dikalibrasi** pakai dataset historis sebelum demo.

### 7.5 Keputusan Review (manusia)

| Keputusan | Berlaku untuk | Wajib alasan |
|---|---|---|
| `APPROVED` | `FULL_MATCH`, `PARTIAL_MATCH`, `NO_MATCH`, `ANOMALY` | Tidak untuk `FULL_MATCH`; **ya** untuk lainnya (ini = override) |
| `REJECTED_BY_REVIEWER` | Semua non-veto | Ya |
| `INVESTIGATION_NOTE` | `REJECTED` (veto) | Ya — hanya catatan, status tidak berubah |

Override didefinisikan sebagai: meng-approve sesuatu yang bukan `FULL_MATCH`. Wajib alasan, tercatat di audit dengan status asal.

### 7.6 Narasi Alasan (Zona AI, opsional)

Setelah engine memutuskan, sistem memanggil LLM dengan input: kode veto/status, skor per komponen, dan **nilai pembanding** (misal rekening di invoice vs rekening di master). LLM menghasilkan 1-3 kalimat Bahasa Indonesia yang disimpan di `matches.explanation`. Aturan:

- Tidak boleh menyebut angka/nama yang tidak ada di input.
- `veto_reason` dan `score_breakdown` (deterministik) disimpan terpisah dan tetap tampil kalau `explanation` kosong/gagal.
- Kalau LLM error → `explanation = null`, proses tidak gagal.

---

## 8. Status & Enum (Sumber Kebenaran)

```ts
// Status dokumen (siklus hidup file)
type DocumentStatus =
  | 'UPLOADED' | 'EXTRACTING' | 'EXTRACTED'
  | 'NEEDS_CORRECTION' | 'EXTRACTION_FAILED' | 'UNSUPPORTED_FORMAT';

// Status match (hasil engine, satu per dokumen)
type MatchStatus = 'REJECTED' | 'FULL_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH';
type AnomalyFlag = boolean;            // terpisah dari MatchStatus

type VetoCode =
  | 'VETO_VENDOR_NOT_FOUND' | 'VETO_VENDOR_NOT_VERIFIED'
  | 'VETO_BANK_MISMATCH' | 'VETO_DUPLICATE_INVOICE';

// Status keputusan (alur manusia)
type ReviewStatus =
  | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED_BY_REVIEWER' | 'PAID';

type VendorStatus = 'verified' | 'unverified' | 'suspended';
type Role = 'admin' | 'ap_staff' | 'approver';
type FieldConfidence = 'high' | 'medium' | 'low' | 'manual';
```

Transisi `ReviewStatus` yang sah: `PENDING_REVIEW → APPROVED | REJECTED_BY_REVIEWER`, `APPROVED → PAID` (hanya `approver`). Tidak ada transisi mundur; koreksi = catatan investigasi + dokumen baru.

---

## 9. Chatbot Q&A (Zona AI, Read-Only)

- Akses: `approver` dan `admin` saja.
- Bahasa: Indonesia.
- Implementasi: Claude API tool-calling langsung (bukan MCP). Semua tool adalah query Supabase read-only dengan `organization_id` dari session.
- Kalau pertanyaan di luar cakupan tools → jawab "belum bisa menjawab pertanyaan itu", bukan mengarang.

| Tool | Deskripsi |
|---|---|
| `get_vendor_total(vendor_name, period_start?, period_end?)` | Total nominal invoice `PAID` untuk vendor |
| `check_invoice_status(invoice_number)` | Status dokumen, match, review, veto/skor |
| `list_flagged_transactions(filter?)` | Daftar `PARTIAL_MATCH` / `NO_MATCH` / `ANOMALY` yang masih `PENDING_REVIEW` |
| `get_document_detail(document_id)` | Field hasil ekstraksi + confidence |

System prompt chatbot menegaskan: jawab hanya dari hasil tool; sebutkan angka persis seperti hasil tool; jangan menyimpulkan di luar data.

---

## 10. Audit Trail

- Tabel `audit_logs` **append-only ditegakkan di database**: `REVOKE UPDATE, DELETE` untuk semua role aplikasi + trigger yang menolak UPDATE/DELETE.
- Satu baris per peristiwa: `organization_id, actor_user_id, actor_role, entity_type, entity_id, action, old_value (jsonb), new_value (jsonb), reason, created_at`.
- Peristiwa yang wajib dicatat: import CSV (per batch + ringkasan), upload dokumen, hasil ekstraksi, koreksi manual per field, hasil matching (veto/skor/status), setiap keputusan review, tandai PAID, perubahan status/bank vendor, perubahan peran user.
- Halaman audit log: filter per entitas & rentang tanggal, ekspor CSV.

---

## 11. Model Data Inti

| Tabel | Kolom kunci |
|---|---|
| `organizations` | `id, name, created_at` |
| `profiles` | `id (= auth.users.id), organization_id, role, full_name` |
| `vendors` | `id, organization_id, vendor_code, vendor_name, npwp, bank_name, bank_account_number, bank_account_holder, status, last_verified_at` — unik `(organization_id, vendor_code)` |
| `purchase_orders` | `id, organization_id, po_number, vendor_id, po_date, currency, total_amount (computed)` — unik `(organization_id, po_number)` |
| `purchase_order_lines` | `id, po_id, line_no, item_description, quantity, unit_price` |
| `documents` | `id, organization_id, storage_path, original_filename, mime_type, status (DocumentStatus), uploaded_by, created_at` |
| `extractions` | `id, document_id, raw_json (jsonb, output LLM), fields (jsonb: {value, confidence} per field), model, created_at` |
| `invoices` | `id, organization_id, document_id, vendor_id?, po_id?, invoice_number, invoice_date, total_amount, bank_*, npwp, line_items (jsonb)` — data **setelah** koreksi manual; ini yang dipakai matching |
| `matches` | `id, invoice_id, status (MatchStatus), veto_code?, score, score_breakdown (jsonb), anomaly_flag, anomaly_reason?, explanation?, review_status (ReviewStatus), reviewed_by?, reviewed_at?, review_reason?, paid_marked_by?, paid_at?` |
| `audit_logs` | lihat Bagian 10 |

Semua tabel punya `organization_id` sejak migration pertama + RLS: `organization_id = (select organization_id from profiles where id = auth.uid())`. API route yang memakai service-role key **wajib** memfilter `organization_id` manual.

---

## 12. Tech Stack

### 12.1 Tech Stack MVP (yang dipakai sekarang)

| Layer | Teknologi | Catatan |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | Single app; Route Handlers untuk API. `middleware.ts` sudah deprecated di Next 16 dan berganti nama jadi `proxy.ts` — fungsinya identik |
| UI | Tailwind CSS + shadcn/ui | Tambah komponen per kebutuhan (Button, Table, Card, Dialog, Badge, Form) |
| Database | Supabase Postgres, region **Singapore** | `organization_id` + RLS di semua tabel |
| Auth | Supabase Auth (email/password) | OAuth ditunda |
| File storage | Supabase Storage, bucket `documents` | RLS per organisasi; simpan file asli untuk audit |
| CSV parsing | PapaParse | Import vendor & PO |
| PDF text extraction | `pdf-parse` (Node) | Cek text layer; kalau kosong → `UNSUPPORTED_FORMAT` |
| LLM ekstraksi & narasi | Claude API via `@anthropic-ai/sdk`, satu model (Sonnet) | Structured output / tool-use untuk JSON terjamin skema. Routing Haiku = Fase 2 |
| Similarity | Jaro-Winkler ditulis sendiri di `lib/matching/similarity.ts` + unit test | Tidak pakai fuse.js (itu library search, bukan string similarity). Menghindari dependency drift |
| Matching & scoring | TypeScript murni di `lib/matching/` | Python microservice ditunda |
| Chatbot | Claude API tool-calling (direct) | 4 tools read-only |
| Background job | Tanpa queue; ekstraksi dijalankan di Route Handler dengan `maxDuration` tinggi, status `EXTRACTING` di-poll UI | Kalau deploy Vercel: set `export const maxDuration = 300`. Queue proper = Fase 2 |
| Validasi skema | Zod | Input API, CSV, output LLM |
| Testing | Vitest | Wajib untuk `lib/matching/*` |
| Deploy | Vercel (frontend + API) + Supabase | Staging sejak skeleton |
| Observability | Console + Vercel logs | Sentry = Fase 2 |

Model string dan opsi structured output dicek ke dokumentasi Claude API saat implementasi (lihat panduan pengerjaan).

### 12.2 Tech Stack Visi Produk Matang (Fase 2-3)

| Layer | Teknologi |
|---|---|
| Vision LLM (scan/foto) | Claude Sonnet vision, fallback hanya jika text layer kosong |
| LLM murah untuk PDF sederhana | Claude Haiku + routing biaya |
| Matching microservice | Python (FastAPI) + rapidfuzz — hanya jika volume/kompleksitas menuntut |
| Background job | Trigger.dev atau Supabase Edge Functions + pg_cron |
| Email ingestion | Postmark / SendGrid Inbound Parse |
| Notifikasi | WhatsApp Business API (Twilio/Qontak) + email |
| Observability | Sentry + logging terstruktur |
| Integrasi | Bank (konfirmasi transfer), DJP/e-Faktur (validasi NPWP), ERP klien (SAP/Accurate/Jurnal — spesifik per klien) |
| Monorepo | Turborepo: `apps/web`, `apps/matching-service`, `packages/shared-types` |

---

## 13. Struktur Folder MVP

```
finrecon-ai/
├── CLAUDE.md
├── docs/
│   ├── product-doc-v2.md          # dokumen ini
│   ├── dev-guide.md               # panduan pengerjaan
│   └── llm-context/               # llms.txt / dokumentasi referensi
├── fixtures/
│   ├── invoices/                  # 20-30 sampel PDF + ground-truth.json
│   ├── vendors.csv
│   ├── purchase_orders.csv
│   └── invoice_history.csv        # untuk baseline anomali
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx               # ringkasan: pending review, rejected, dsb.
│   │   ├── documents/page.tsx
│   │   ├── documents/[id]/page.tsx    # detail + koreksi field
│   │   ├── matches/page.tsx
│   │   ├── matches/[id]/page.tsx      # review panel
│   │   ├── vendors/page.tsx           # master vendor + import
│   │   ├── purchase-orders/page.tsx   # import PO
│   │   ├── audit-log/page.tsx
│   │   └── chat/page.tsx
│   ├── api/
│   │   ├── documents/upload/route.ts
│   │   ├── documents/[id]/correct/route.ts
│   │   ├── vendors/import/route.ts
│   │   ├── purchase-orders/import/route.ts
│   │   ├── matches/[id]/review/route.ts
│   │   ├── matches/[id]/mark-paid/route.ts
│   │   └── chat/route.ts
│   └── layout.tsx
├── components/
│   ├── ui/                        # shadcn
│   ├── documents/
│   ├── matches/
│   ├── vendors/
│   └── chatbot/
├── lib/
│   ├── supabase/                  # client.ts, server.ts, admin.ts
│   ├── document-router/           # ZONA DETERMINISTIK
│   │   ├── detect-file-type.ts
│   │   └── extract-pdf-text.ts
│   ├── matching/                  # ZONA DETERMINISTIK
│   │   ├── config.ts              # semua threshold & bobot
│   │   ├── normalize.ts
│   │   ├── similarity.ts          # Jaro-Winkler
│   │   ├── veto.ts
│   │   ├── scoring.ts
│   │   ├── classify.ts
│   │   ├── anomaly.ts
│   │   └── index.ts               # runMatching(invoice, ctx) → MatchResult
│   ├── llm/                       # ZONA AI
│   │   ├── client.ts
│   │   ├── schemas/invoice.ts     # Zod schema output ekstraksi
│   │   ├── extract-invoice.ts
│   │   └── explain-match.ts
│   ├── chatbot/                   # ZONA AI
│   │   ├── tools.ts
│   │   └── tool-schemas.ts
│   ├── audit.ts                   # logAudit()
│   └── csv/                       # parser + validator vendor & PO
├── types/
│   ├── database.types.ts          # generated dari Supabase
│   └── domain.ts                  # enum Bagian 8
├── tests/
│   └── matching/                  # veto, scoring, classify, anomaly, similarity
└── proxy.ts                       # dulu middleware.ts (deprecated di Next 16)
```

---

## 14. Fase Pengembangan MVP

Tanpa estimasi hari. Setiap fase punya definisi "selesai" yang bisa dicek.

**Fase 0 — Persiapan (manual, sebelum coding)**
Repo + `CLAUDE.md`, `docs/llm-context/`, fixtures (minimal 5 invoice awal, `vendors.csv`, `purchase_orders.csv`), akun Supabase (Singapore) & Anthropic, `.env`.
*Selesai:* Claude Code bisa membaca konteks lengkap; ada data uji.

**Fase 1 — Skeleton & Multi-tenant**
Init Next.js, migration semua tabel Bagian 11 + RLS, Supabase Auth, seed 1 organisasi + 3 user (admin/ap_staff/approver), layout dashboard kosong, deploy staging.
*Selesai:* login sebagai 3 peran, RLS terbukti (user org A tidak lihat data org B via test).

**Fase 2 — Master Data**
Import CSV vendor & PO dengan validasi baris, halaman list vendor + indikator kesiapan, ubah status vendor (dicatat audit), list PO.
*Selesai:* `fixtures/vendors.csv` & `purchase_orders.csv` terimpor tanpa error; file invalid ditolak dengan pesan per baris.

**Fase 3 — Vertical Slice Invoice**
Upload PDF → router (tolak non-teks) → ekstraksi Claude (structured output, confidence per field) → simpan `extractions` + `invoices` → halaman detail dengan koreksi manual → `NEEDS_CORRECTION` flow.
*Selesai:* 5 sampel invoice terekstrak; field kritis low-confidence menahan dokumen; koreksi tercatat di audit.

**Fase 4 — Matching Engine (test-first)**
Unit test dulu untuk `similarity`, `normalize`, `veto`, `scoring`, `classify`, `anomaly` → implementasi → integrasi `runMatching()` dipanggil setelah ekstraksi selesai/koreksi tersimpan → halaman list match dengan badge status.
*Selesai:* semua test hijau; invoice dengan rekening salah → `REJECTED`; invoice ganda → `REJECTED`; invoice cocok → `FULL_MATCH`.

**Fase 5 — Review Panel, Approval, PAID & Audit Log**
Review panel (approve/reject/override + alasan wajib), tombol tandai PAID (approver), narasi LLM `explain-match`, halaman audit log + ekspor CSV, DB-level append-only.
*Selesai:* override tanpa alasan ditolak; `ap_staff` tidak bisa tandai PAID; `UPDATE audit_logs` gagal di DB.

**Fase 6 — Anomali & Chatbot**
Import `invoice_history.csv` sebagai baseline, kalibrasi threshold, flag anomali di review panel; chatbot 4 tools, akses approver/admin, uji grounding (pertanyaan di luar cakupan → "belum bisa menjawab").
*Selesai:* kasus anomali di fixtures terdeteksi; chatbot tidak pernah menyebut angka yang tidak ada di hasil tool.

**Fase 7 — Polish Demo**
Dashboard ringkasan, empty state, loading state, skenario demo tertulis (Bagian 15), uji end-to-end oleh orang di luar tim.

---

## 15. Kriteria Uji MVP (Skenario Demo)

Demo pertama: ke BizDev (ayah). Skenario yang harus jalan mulus:

1. Import vendor & PO dari CSV → indikator vendor tampil.
2. Upload invoice cocok → `FULL_MATCH` → approve → tandai PAID → muncul di audit.
3. Upload invoice yang sama lagi → `REJECTED` (`VETO_DUPLICATE_INVOICE`) + narasi alasan.
4. Upload invoice dengan rekening berbeda dari master → `REJECTED` (`VETO_BANK_MISMATCH`), tombol override tidak ada.
5. Upload invoice dengan harga selisih 3% → `PARTIAL_MATCH` → override dengan alasan → tercatat.
6. Upload invoice nominal 8× rata-rata vendor → flag `ANOMALY` di review panel.
7. Upload invoice dengan nomor invoice tidak terbaca → `NEEDS_CORRECTION` → koreksi → lanjut matching.
8. Upload PDF hasil scan → `UNSUPPORTED_FORMAT` dengan pesan jelas.
9. Chatbot: "Total tagihan PT X tahun ini?" → angka sesuai DB; "Siapa CEO PT X?" → "belum bisa menjawab".
10. Login sebagai org lain → tidak melihat data apa pun dari org pertama.

---

## 16. Yang Ditunda (Bukan MVP)

BAST & matching 3-arah penuh · vision untuk scan/foto · SoD penuh & delegation of authority · payment gate 3-gerbang lengkap · manajemen perubahan rekening (dual approval + waiting period 3 hari) · vendor onboarding 4 tahap · integrasi bank/DJP/ERP · multi-jenis pembayaran (reimburse, pajak, payroll, cicilan, mitra) · skor risiko vendor · prediksi cash flow · notifikasi WhatsApp/email · email ingestion · OAuth · background queue · Python microservice.

---

## 17. Keputusan Terbuka (TBD)

| Item | Status | Pemilik |
|---|---|---|
| Sampel invoice nyata (anonim) dari jaringan BizDev | Belum ada — sementara pakai dummy | BizDev |
| Dataset historis dummy (`invoice_history.csv`, 8-10 vendor × 12-24 transaksi, sisipkan 3-5 anomali & 1-2 duplikat) | Diminta ke consulting firm | BizDev |
| Kalibrasi threshold 90/60/×3/Rp 500 jt | Setelah dataset ada | Engineering |
| Jawaban standar untuk "integrasi ke ERP kami?" | Perlu disusun sebelum pitching pertama ke klien | BizDev + Engineering |
| Kebijakan retensi dokumen & UU PDP (data di Singapore) | Perlu satu paragraf resmi | BizDev |

---

## 18. Aturan Bisnis (Referensi ke BRD)

**Hard rule (tidak bisa di-override):** BR-01 vendor verified sebelum transaksi · BR-03 rekening tujuan 100% cocok master · BR-04 invoice PAID tidak boleh dibayar lagi · BR-11 audit trail permanen.
**Diterapkan sebagian di MVP:** BR-05/06/07 SoD (hanya ap_staff ≠ approver untuk PAID) · BR-12 NPWP > 12 bulan (indikator saja).
**Ditunda:** BR-02, BR-08, BR-09, BR-10, BR-13.

---

## 19. Checklist Menuju Production-Ready

Keamanan (audit RLS, enkripsi kolom rekening, rate limit API, sanitasi upload) · Skalabilitas (queue proper) · Observability (Sentry, tracing ekstraksi) · Testing (coverage `lib/matching` 100%, e2e skenario Bagian 15) · Multi-tenant hardening (uji isolasi eksplisit) · Kepatuhan (retensi, enkripsi at-rest, UU PDP) · Integrasi ERP klien pertama · Uji grounding chatbot menyeluruh · Finalisasi baseline anomali bersama tim.