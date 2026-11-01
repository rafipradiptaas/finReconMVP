#!/usr/bin/env python3
"""Builds invoice PDFs + ground truth from eval/data/table.csv.

Fixture rows go to fixtures/invoices/ (with the aggregate ground-truth.json the
tests read). Eval rows go to eval/data/pdfs/. Every document also gets
eval/data/ground_truth/<doc_id>.json, with values normalized per product doc 6.3.

Vendors and PO lines come from fixtures/*.csv, so the documents cannot drift
from the master data. Output is byte-identical between runs: `invariant=1` fixes
the PDF timestamps and id, and the scan noise uses SEED.
"""
import csv
import io
import json
import random
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

SEED = 20261031
PPN_RATE = Decimal("0.11")
ROOT = Path(__file__).resolve().parent.parent
BUYER = "PT Demo Corp Indonesia"
BUYER_ADDRESS = "Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan 12190"
BUYER_NPWP = "01.000.111.2-093.000"
SECOND_BANK = ("Permata", "9988776655", "untuk pembayaran valuta asing (USD)")
TERMS = (
    "Syarat pembayaran: pembayaran dilakukan penuh sesuai jatuh tempo yang tertera. "
    "Keterlambatan dikenakan denda administrasi sesuai perjanjian kerja sama. "
    "Barang atau jasa yang telah diterima dan diperiksa tidak dapat dikembalikan "
    "kecuali terdapat cacat yang dilaporkan paling lambat tujuh hari kalender."
)
MONTHS_ID = "Januari Februari Maret April Mei Juni Juli Agustus September Oktober November Desember".split()
MONTHS_EN = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
LEFT, RIGHT, TOP, BOTTOM = 20 * mm, A4[0] - 20 * mm, A4[1] - 20 * mm, 20 * mm


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def money_digits(value, thousands, decimal_sep=None):
    whole, _, cents = f"{value:.2f}".partition(".")
    grouped = f"{int(whole):,}".replace(",", thousands)
    return f"{grouped}{decimal_sep}{cents}" if decimal_sep else grouped


def fmt_money(value, style):
    return {
        "id": lambda: "Rp " + money_digits(value, "."),
        "id_dec": lambda: "Rp " + money_digits(value, ".", ","),
        "id_norp": lambda: money_digits(value, ".", ","),
        "en": lambda: "Rp " + money_digits(value, ",", "."),
        "en_norp": lambda: money_digits(value, ",", "."),
        "idr_en": lambda: "IDR " + money_digits(value, ","),
    }[style]()


def fmt_date(iso, style):
    d = date.fromisoformat(iso)
    return {
        "iso": iso,
        "dmy_slash": f"{d.day:02d}/{d.month:02d}/{d.year}",
        "dmy_dash": f"{d.day:02d}-{d.month:02d}-{d.year}",
        "id_long": f"{d.day} {MONTHS_ID[d.month - 1]} {d.year}",
        "en_long": f"{MONTHS_EN[d.month - 1]} {d.day}, {d.year}",
    }[style]


def fmt_npwp(n):
    return f"{n[:2]}.{n[2:5]}.{n[5:8]}.{n[8]}-{n[9:12]}.{n[12:15]}"


def plain(number):
    """JSON number: integer when whole, so ground truth reads like the CSVs."""
    return int(number) if number == number.to_integral_value() else float(number)


def build(row, vendors, po_lines):
    """Resolves one table row into the document's values."""
    vendor = vendors[row["vendor_code"]]
    factor = Decimal(row["price_factor"])
    lines = []
    for line in po_lines[row["po_number"]]:
        quantity = Decimal(line["quantity"])
        unit_price = (Decimal(line["unit_price"]) * factor).quantize(Decimal(1), ROUND_HALF_UP)
        lines.append(
            {
                "description": line["item_description"],
                "quantity": quantity,
                "unit_price": unit_price,
                "subtotal": quantity * unit_price,
            }
        )
    subtotal = sum(line["subtotal"] for line in lines)
    non_pkp = row["non_pkp"] == "1"
    tax = Decimal(0) if non_pkp else (subtotal * PPN_RATE).quantize(Decimal(1), ROUND_HALF_UP)
    name = row["vendor_name_override"] or vendor["vendor_name"]
    return {
        "name": name,
        "address": row["vendor_address"],
        "npwp": row["npwp_override"] or vendor["npwp"],
        "bank_name": vendor["bank_name"],
        "account": row["bank_override"] or vendor["bank_account_number"],
        "holder": row["holder_override"] or vendor["bank_account_holder"],
        "invoice_number": row["invoice_number"] or None,
        "po": (row["printed_po"] or row["po_number"]) if row["po_placement"] != "absent" else None,
        "lines": lines,
        "subtotal": subtotal,
        "tax": tax,
        "total": subtotal + tax,
        "non_pkp": non_pkp,
    }


class Page:
    """A cursor over reportlab's canvas that starts a new page when it runs out."""

    def __init__(self, path):
        self.c = canvas.Canvas(str(path), pagesize=A4, invariant=1)
        self.y = TOP

    def text(self, x, value, font="Helvetica", size=10, align="left"):
        self.c.setFont(font, size)
        draw = {"left": self.c.drawString, "right": self.c.drawRightString}[align]
        draw(x, self.y, value)

    def down(self, amount):
        self.y -= amount
        if self.y < BOTTOM:
            self.c.showPage()
            self.y = TOP

    def line(self):
        self.c.line(LEFT, self.y, RIGHT, self.y)

    def paragraph(self, value, size=9):
        for part in simpleSplit(value, "Helvetica", size, RIGHT - LEFT):
            self.text(LEFT, part, size=size)
            self.down(size + 3)


def po_label(doc, row, label):
    return [(label, doc["po"])] if row["po_placement"] == "header" else []


def header_classic(p, doc, row, f_date):
    p.text(LEFT, "INVOICE", "Helvetica-Bold", 20)
    p.down(10 * mm)
    p.text(LEFT, doc["name"], "Helvetica-Bold", 12)
    p.down(5 * mm)
    p.text(LEFT, doc["address"], size=9)
    p.down(4 * mm)
    p.text(LEFT, f"NPWP: {fmt_npwp(doc['npwp'])}", size=9)
    p.down(8 * mm)
    rows = [("Nomor Invoice", doc["invoice_number"] or "-"), ("Tanggal", f_date(row["invoice_date"]))]
    rows += [("Jatuh Tempo", f_date(row["due_date"]))] + po_label(doc, row, "Nomor PO")
    for label, value in rows:
        p.text(LEFT, label, size=10)
        p.text(LEFT + 35 * mm, f": {value}", size=10)
        p.down(5 * mm)
    p.down(3 * mm)
    p.text(LEFT, "Ditagihkan kepada:", "Helvetica-Bold", 10)
    p.down(5 * mm)
    for value in (BUYER, BUYER_ADDRESS, f"NPWP {BUYER_NPWP}"):
        p.text(LEFT, value, size=9)
        p.down(4 * mm)
    p.down(4 * mm)


def header_banner(p, doc, row, f_date):
    p.text(LEFT, doc["name"].upper(), "Helvetica-Bold", 14)
    p.down(5 * mm)
    p.text(LEFT, f"{doc['address']} | NPWP {fmt_npwp(doc['npwp'])}", size=9)
    p.down(4 * mm)
    p.line()
    p.down(7 * mm)
    p.text(LEFT, "INVOICE", "Helvetica-Bold", 10)
    p.text(LEFT + 25 * mm, doc["invoice_number"] or "-", size=10)
    if row["po_placement"] == "header":
        p.text(LEFT + 90 * mm, "PO", "Helvetica-Bold", 10)
        p.text(LEFT + 105 * mm, doc["po"], size=10)
    p.down(5 * mm)
    p.text(LEFT, "TANGGAL", "Helvetica-Bold", 10)
    p.text(LEFT + 25 * mm, f_date(row["invoice_date"]), size=10)
    p.text(LEFT + 90 * mm, "JATUH TEMPO", "Helvetica-Bold", 10)
    p.text(LEFT + 120 * mm, f_date(row["due_date"]), size=10)
    p.down(7 * mm)
    p.text(LEFT, f"Bill to: {BUYER}, {BUYER_ADDRESS}, NPWP {BUYER_NPWP}", size=8)
    p.down(8 * mm)


def header_faktur(p, doc, row, f_date):
    column = LEFT + 95 * mm
    p.text(LEFT, doc["name"], "Helvetica-Bold", 13)
    p.text(RIGHT, "FAKTUR / INVOICE", "Helvetica-Bold", 13, "right")
    p.down(5 * mm)
    p.text(LEFT, doc["address"], size=9)
    p.down(4 * mm)
    p.text(LEFT, f"NPWP {fmt_npwp(doc['npwp'])}", size=9)
    p.down(8 * mm)
    left = ["Kepada:", BUYER, BUYER_ADDRESS, f"NPWP {BUYER_NPWP}"]
    number = doc["invoice_number"] or "______________ (lihat lampiran)"
    right = [f"No. Invoice: {number}", f"Tanggal: {f_date(row['invoice_date'])}"]
    right += [f"Jatuh tempo: {f_date(row['due_date'])}"]
    if row["po_placement"] == "header":
        right += [f"Ref. PO: {doc['po']}"]
    for i in range(max(len(left), len(right))):
        if i < len(left):
            p.text(LEFT, left[i], size=9)
        if i < len(right):
            p.text(column, right[i], size=9)
        p.down(4.5 * mm)
    p.down(4 * mm)


def header_ledger(p, doc, row, f_date):
    p.text(LEFT, "TAX INVOICE", "Helvetica-Bold", 16)
    p.text(RIGHT, doc["name"], "Helvetica-Bold", 11, "right")
    p.down(5 * mm)
    p.text(RIGHT, doc["address"], size=8, align="right")
    p.down(4 * mm)
    p.text(RIGHT, f"Tax ID (NPWP) {fmt_npwp(doc['npwp'])}", size=8, align="right")
    p.down(6 * mm)
    p.line()
    p.down(6 * mm)
    rows = [("Invoice No.", doc["invoice_number"] or "-"), ("Invoice Date", f_date(row["invoice_date"]))]
    rows += [("Due Date", f_date(row["due_date"]))] + po_label(doc, row, "Purchase Order")
    for label, value in rows:
        p.text(LEFT, f"{label}:", "Helvetica-Bold", 9)
        p.text(LEFT + 32 * mm, value, size=9)
        p.down(4.5 * mm)
    p.down(2 * mm)
    p.text(LEFT, f"Customer: {BUYER} ({BUYER_NPWP})", size=9)
    p.down(4 * mm)
    p.text(LEFT, BUYER_ADDRESS, size=9)
    p.down(7 * mm)


HEADERS = {
    "classic": header_classic,
    "banner": header_banner,
    "faktur": header_faktur,
    "ledger": header_ledger,
}
LABELS = {
    "ledger": ("No", "Description", "Qty", "Unit Price", "Amount", "Subtotal", "VAT 11%", "GRAND TOTAL"),
}
DEFAULT_LABELS = ("No", "Deskripsi", "Qty", "Harga Satuan", "Jumlah", "Subtotal", "PPN 11%", "TOTAL")


def write_lines(p, doc, row, f_money):
    labels = LABELS.get(row["template"], DEFAULT_LABELS)
    narrow = row["narrow_desc"] == "1"
    desc_width = (32 if narrow else 80) * mm
    columns = (LEFT, LEFT + 10 * mm, LEFT + 92 * mm, RIGHT - 32 * mm, RIGHT)
    if row["multi_page"] == "1":
        # Starts the table at the page bottom so it has to cross the page break.
        p.paragraph(TERMS)
        p.y = BOTTOM + 14 * mm
    p.line()
    p.down(5 * mm)
    p.text(columns[0], labels[0], "Helvetica-Bold", 9)
    p.text(columns[1], labels[1], "Helvetica-Bold", 9)
    p.text(columns[2], labels[2], "Helvetica-Bold", 9)
    p.text(columns[3], labels[3], "Helvetica-Bold", 9, "right")
    p.text(columns[4], labels[4], "Helvetica-Bold", 9, "right")
    p.down(2 * mm)
    p.line()
    p.down(5 * mm)
    for number, line in enumerate(doc["lines"], start=1):
        parts = simpleSplit(line["description"], "Helvetica", 9, desc_width)
        p.text(columns[0], str(number), size=9)
        p.text(columns[1], parts[0], size=9)
        p.text(columns[2], f"{line['quantity']:f}", size=9)
        p.text(columns[3], f_money(line["unit_price"]), size=9, align="right")
        p.text(columns[4], f_money(line["subtotal"]), size=9, align="right")
        for part in parts[1:]:
            p.down(4 * mm)
            p.text(columns[1], part, size=9)
        p.down(7 * mm)
    p.down(2 * mm)
    totals = [(labels[5], doc["subtotal"])]
    if not doc["non_pkp"]:
        totals += [(labels[6], doc["tax"])]
    totals += [(labels[7], doc["total"])]
    for label, value in totals:
        p.text(RIGHT - 60 * mm, label, "Helvetica-Bold", 10)
        p.text(RIGHT, f_money(value), "Helvetica-Bold", 10, "right")
        p.down(6 * mm)
    p.down(4 * mm)


def write_footer(p, doc, row):
    p.text(LEFT, "Pembayaran ditransfer ke:", "Helvetica-Bold", 10)
    p.down(5 * mm)
    p.text(LEFT, f"Bank {doc['bank_name']} No. Rek. {doc['account']} a.n. {doc['holder']}", size=9)
    p.down(5 * mm)
    if row["second_bank"] == "1":
        bank, account, purpose = SECOND_BANK
        p.text(LEFT, f"Bank {bank} No. Rek. {account} a.n. {doc['holder']} {purpose}", size=9)
        p.down(5 * mm)
    if row["po_placement"] == "notes":
        p.text(LEFT, f"Catatan: tagihan ini merujuk ke pesanan {doc['po']}.", size=9)
        p.down(5 * mm)
    if row["note"]:
        p.text(LEFT, row["note"], size=9)
        p.down(5 * mm)
    p.down(6 * mm)
    p.text(LEFT, "Hormat kami,", size=9)
    p.down(15 * mm)
    p.text(LEFT, doc["name"], size=9)
    if row["po_placement"] == "footer":
        p.down(8 * mm)
        p.text(LEFT, f"Ref: {doc['po']}", size=7)


def write_pdf(path, doc, row):
    p = Page(path)
    f_date = lambda iso: fmt_date(iso, row["date_format"])
    f_money = lambda value: fmt_money(value, row["number_format"])
    HEADERS[row["template"]](p, doc, row, f_date)
    write_lines(p, doc, row, f_money)
    write_footer(p, doc, row)
    p.c.showPage()
    p.c.save()


def write_scan(path, doc, row):
    """An image-only PDF: there is no text layer for the router to read."""
    rng = random.Random(SEED)
    image = Image.new("L", (850, 1200), 245)
    draw = ImageDraw.Draw(image)
    rows = ["INVOICE (SCAN)", doc["name"], f"No. {doc['invoice_number']}", f"PO {doc['po']}"]
    rows += [f"Total {fmt_money(doc['total'], 'id')}", f"Rek {doc['account']}"]
    for i, value in enumerate(rows):
        draw.text((60, 80 + i * 40), value, fill=30, font_size=26)
    pixels = image.load()
    for _ in range(40000):
        pixels[rng.randrange(850), rng.randrange(1200)] = rng.randrange(120, 255)
    image = image.rotate(1.5, fillcolor=245)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False)
    buffer.seek(0)
    c = canvas.Canvas(str(path), pagesize=A4, invariant=1)
    c.drawImage(ImageReader(buffer), 0, 0, width=A4[0], height=A4[1])
    c.showPage()
    c.save()


def ground_truth(doc, row):
    if row["template"] == "scan":
        fields = dict.fromkeys(
            "invoice_number invoice_date vendor_name npwp po_number bank_name "
            "bank_account_number bank_account_holder subtotal tax_amount total_amount".split()
        )
        return {**fields, "line_items": []}
    return {
        "invoice_number": doc["invoice_number"],
        "invoice_date": row["invoice_date"],
        "vendor_name": doc["name"],
        "npwp": doc["npwp"],
        "po_number": doc["po"],
        "bank_name": doc["bank_name"],
        "bank_account_number": doc["account"],
        "bank_account_holder": doc["holder"],
        "subtotal": plain(doc["subtotal"]),
        "tax_amount": plain(doc["tax"]),
        "total_amount": plain(doc["total"]),
        "line_items": [
            {
                "description": line["description"],
                "quantity": plain(line["quantity"]),
                "unit_price": plain(line["unit_price"]),
                "subtotal": plain(line["subtotal"]),
            }
            for line in doc["lines"]
        ],
    }


def expected(row):
    result = {
        "document_status": row["expected_document_status"],
        "match_status": row["expected_match_status"] or None,
        "veto_code": row["expected_veto_code"] or None,
        "anomaly_flag": row["expected_anomaly_flag"] == "1",
    }
    if row["after_manual_correction"]:
        result["after_manual_correction"] = row["after_manual_correction"]
    if row["vendor_indicator"]:
        result["vendor_indicator"] = row["vendor_indicator"]
    return result


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    vendors = {v["vendor_code"]: v for v in read_csv(ROOT / "fixtures/vendors.csv")}
    po_lines = {}
    for line in read_csv(ROOT / "fixtures/purchase_orders.csv"):
        po_lines.setdefault(line["po_number"], []).append(line)

    pdf_dirs = {"fixture": ROOT / "fixtures/invoices", "eval": ROOT / "eval/data/pdfs"}
    truth_dir = ROOT / "eval/data/ground_truth"
    for directory in (*pdf_dirs.values(), truth_dir):
        directory.mkdir(parents=True, exist_ok=True)

    aggregate = {}
    for row in read_csv(ROOT / "eval/data/table.csv"):
        doc = build(row, vendors, po_lines)
        path = pdf_dirs[row["set"]] / row["filename"]
        (write_scan if row["template"] == "scan" else write_pdf)(path, doc, row)
        truth = ground_truth(doc, row)
        if row["set"] == "fixture":
            aggregate[row["filename"]] = {**truth, "expected": expected(row)}
        write_json(
            truth_dir / f"{row['doc_id']}.json",
            {
                "doc_id": row["doc_id"],
                "file": str(path.relative_to(ROOT)),
                "template": row["template"],
                "variant": {
                    "date_format": row["date_format"],
                    "number_format": row["number_format"],
                    "po_placement": row["po_placement"],
                    "non_pkp": row["non_pkp"] == "1",
                    "second_bank": row["second_bank"] == "1",
                    "multi_page": row["multi_page"] == "1",
                    "narrow_desc": row["narrow_desc"] == "1",
                },
                "fields": truth,
                "expected": expected(row),
            },
        )
    write_json(pdf_dirs["fixture"] / "ground-truth.json", aggregate)
    print(f"{len(aggregate)} fixtures, {len(list(truth_dir.glob('ev*.json')))} eval documents")


if __name__ == "__main__":
    main()
