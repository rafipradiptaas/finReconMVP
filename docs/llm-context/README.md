# llm-context

Dokumentasi referensi yang diunduh mentah (2026-09-09) supaya Claude Code
memakai API versi sekarang, bukan versi lama dari training-nya. Sertakan
dengan `@docs/llm-context/<file>` saat mengerjakan fase yang relevan.

| File | Dipakai di fase |
|---|---|
| `supabase-rls.md` | 1 (RLS per organisasi) |
| `supabase-ssr-nextjs.md` | 1 (`@supabase/ssr`, **bukan** auth-helpers) |
| `supabase-auth-advanced.md` | 1 (session di server, middleware) |
| `supabase-storage-uploads.md` | 3 (bucket `documents`) |
| `nextjs-route-handlers.md` | 1-9 (semua `app/api/**/route.ts`, `maxDuration`) |
| `nextjs-middleware.md` | 1 (`proxy.ts`, nama baru `middleware.ts`) |
| `anthropic-tool-use.md` | 3, 5, 7, 8 (`tool_choice` paksa satu tool, loop tool) |
| `anthropic-models.md` | 3, 6 (nama model) |

**Nama model per 2026-09-09:** `claude-sonnet-5`. Cek ulang sebelum dipakai.
Taruh di `lib/llm/config.ts` (Fase 3), jangan disebar.

Yang masih harus ditambahkan (bertanda ★ di Bagian 6 `docs/dev-guide.md`):
vision/PDF Claude, pricing, `pdfjs-dist` atau `unpdf`, Resend.

Perbarui dengan `curl -sSL <url>.md` — dokumen Anthropic, Supabase, dan
Next.js semuanya menyajikan markdown mentah dengan akhiran `.md`.
