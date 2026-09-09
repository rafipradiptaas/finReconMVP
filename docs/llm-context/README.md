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
| `nextjs-route-handlers.md` | 1-6 (semua `app/api/**/route.ts`, `maxDuration`) |
| `nextjs-middleware.md` | 1 (`middleware.ts`) |
| `anthropic-tool-use.md` | 3, 5, 6 (`tool_choice` paksa satu tool) |
| `anthropic-models.md` | 3 (nama model) |

**Nama model per 2026-09-09:** `claude-sonnet-5`. Taruh di satu konstanta di
`lib/llm/client.ts` (Fase 3), jangan disebar.

Perbarui dengan `curl -sSL <url>.md` — dokumen Anthropic, Supabase, dan
Next.js semuanya menyajikan markdown mentah dengan akhiran `.md`.
