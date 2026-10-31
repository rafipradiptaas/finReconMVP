# Fixtures FinRecon AI — DATA DUMMY

Semua data di folder ini fiktif. Ganti dengan data nyata (anonim) saat tersedia; format kolom jangan diubah.

Regenerasi PDF dan `invoices/ground-truth.json` (hasil dua kali jalan identik per byte, sumbernya `eval/data/table.csv`, `vendors.csv`, dan `purchase_orders.csv`):

```bash
python3 -m venv .venv && .venv/bin/pip install -r eval/requirements.txt
.venv/bin/python eval/generate.py
```

## File

| File | Isi |
|---|---|
| `vendors.csv` | 10 vendor. V002 & V007 → indikator **Perlu Review** (last_verified > 12 bln / kosong), V006 **unverified**, V008 **suspended**. `contact_email` memakai domain `.example` supaya tidak mungkin terkirim ke alamat asli; V010 sengaja kosong untuk jalur "kontak belum ada" |
| `purchase_orders.csv` | 12 PO, 19 baris (beberapa multi-line). Satu baris per line item |
| `invoice_history.csv` | 138 transaksi PAID, 8 vendor, Okt 2024–Agu 2026. Berisi **4 anomali historis** (~6,5× rata-rata: V003-004, V010-007, V005-009, V002-003) dan **2 duplikat** (H-V001-001 & H-V004-001 muncul dua kali) |
| `invoices/*.pdf` | 10 invoice PDF, 3 tata letak berbeda (`eval/generate.py`) |
| `invoices/ground-truth.json` | Nilai benar per field + hasil match yang diharapkan. Dibaca test fixture-sanity |

## Skenario per invoice

| File | Skenario demo (dok. produk §15) | Hasil yang diharapkan |
|---|---|---|
| 01_full_match_V001 | #2 cocok → approve → PAID; upload lagi untuk #3 duplikat | FULL_MATCH, lalu VETO_DUPLICATE_INVOICE setelah yang pertama APPROVED/PAID |
| 02_partial_price_plus3pct_V003 | #5 harga +3% → override dengan alasan | PARTIAL_MATCH |
| 03_veto_bank_mismatch_V004 | #4 rekening beda dari master | REJECTED / VETO_BANK_MISMATCH |
| 04_needs_correction_no_invoice_number_V005 | #7 nomor invoice tidak ada → koreksi manual | NEEDS_CORRECTION → FULL_MATCH |
| 05_full_match_vendor_needs_review_V002 | indikator vendor "Perlu Review" (tanpa PPN) | FULL_MATCH |
| 06_anomaly_8x_history_V009 | #6 nominal ~9× rata-rata historis | FULL_MATCH + anomaly_flag (flag butuh histori; di aplikasi histori baru masuk lewat import Fase 8) |
| 07_veto_vendor_unverified_V006 | vendor belum verified | REJECTED / VETO_VENDOR_NOT_VERIFIED |
| 08_no_match_unknown_po_V010 | nomor PO tidak ada di sistem | NO_MATCH |
| 09_veto_vendor_not_found_fake_vendor | vendor mirip nama tapi NPWP lain (vendor palsu). D13: similarity Jaro-Winkler < 0,95 ke semua vendor master, dan NPWP tidak ada di master | REJECTED / VETO_VENDOR_NOT_FOUND |
| 10_unsupported_scanned_image_only | #8 PDF hasil scan (tanpa text layer) | UNSUPPORTED_FORMAT |

## Set eval

`eval/data/table.csv` juga membangkitkan 12 dokumen eval (`eval/data/pdfs/ev01–ev12`, ground truth per dokumen di `eval/data/ground_truth/`) dengan 4 template: format tanggal, format angka Indonesia/Inggris dengan/tanpa Rp, multi-halaman, deskripsi multi-baris, nomor PO di catatan/footer/tidak ada, non-PKP, nama vendor mirip, dua nomor rekening. `npm run eval:smoke` memakai ev01–ev10.

## PENTING: PPN dan perbandingan nominal

Invoice nyata mencantumkan Subtotal (DPP) + PPN 11% = Total, sedangkan PO di CSV hanya berisi harga sebelum pajak.
Karena itu **komponen skor "total_amount vs total PO" harus membandingkan `subtotal` invoice (sebelum PPN) dengan total PO**, bukan `total_amount`.
Aturan ini sudah masuk dokumen produk (D2):
- Skema ekstraksi punya `subtotal`, `tax_amount`, `total_amount`.
- Cek konsistensi internal: `subtotal + tax_amount ≈ total_amount` dan `Σ line subtotal ≈ subtotal`.
- Anomali & duplikat tetap memakai `total_amount` (nilai yang benar-benar dibayar). `invoice_history.csv` sudah berisi total (termasuk PPN).
- Invoice 05 sengaja tanpa PPN (`tax_amount = 0`) untuk menguji kasus vendor non-PKP.
