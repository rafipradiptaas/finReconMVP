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
```

| Variabel | Dari mana |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (server-only, jangan pernah dipakai di client) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

Aplikasi Next.js belum ada — dibuat di Fase 1.

## Status fase

- [x] **Fase 0** — repo, dokumen, `docs/llm-context/`, fixtures, `.env.example`
- [ ] **Fase 1** — skeleton Next.js, migration + RLS, auth
- [ ] Fase 2 — master data (vendor & PO)
- [ ] Fase 3 — upload → ekstraksi → koreksi
- [ ] Fase 4 — matching engine (test-first)
- [ ] Fase 5 — review panel, PAID, narasi, audit log
- [ ] Fase 6 — baseline anomali & chatbot
- [ ] Fase 7 — polish demo
