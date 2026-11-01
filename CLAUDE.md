# FinRecon AI — CLAUDE.md

B2B SaaS pre-payment control layer for corporate Accounts Payable (Indonesia). An LLM reads vendor invoices; deterministic code checks every value it read, matches invoices against purchase orders and vendor master data, rejects risky payments with hard rules, and routes grey cases to a human review panel built to resist rubber-stamping. Everything is recorded in an immutable audit trail.

Sources of truth, in order:
1. `docs/decisions/2026-10-31-v3.md` (decision log D1–D24)
2. `docs/product-doc.md` (v3 specification; section numbers below refer to it)
3. this file

If they disagree, the higher one wins — tell the user about the conflict. The work plan and session prompts are in `docs/dev-guide.md`.

## The rule that matters most: AI zone vs deterministic zone

LLMs only do interpretive work. Every financial decision is ordinary deterministic code. LLM output is **data**: validated, checked, stored — never a command.

| Zone | Folders | May | Must never |
|---|---|---|---|
| AI | `lib/llm/`, `lib/agent/`, `lib/chatbot/` | Extract fields with `source_text`; write Indonesian text from values it is given; draft follow-up emails; propose (not apply) a PO number; flag suspicious replies (display only); answer chatbot questions from tool results | Decide or write any status, score, review decision, PAID, vendor/bank data; send email; read data outside the session's organization |
| Deterministic | `lib/document-router/`, `lib/extraction-checks/`, `lib/matching/`, `lib/review/`, `lib/followup-checks/`, `lib/email/`, `lib/audit.ts`, API route decision logic | Everything decision-related | Import from `lib/llm/`, `lib/agent/`, `lib/chatbot/`; call an LLM |

Hard consequences:
- Deterministic folders must not import from AI folders. `lib/extraction-checks`, `lib/matching`, `lib/review`, `lib/followup-checks` are **pure**: no I/O, no Supabase, no network, no `Date.now()` without injection.
- When an LLM fails, the pipeline continues: explanation → `null`; extraction → `EXTRACTION_FAILED`. An LLM error never blocks or changes a deterministic decision.
- Numbers, account numbers, names in LLM-written text come from the input we passed. Never ask the LLM to "figure out" a value we have.
- `organization_id` always comes from the server session. Never a request parameter, never a tool argument, never trusted from the client.
- Document routing is deterministic (file type + text layer). No agent picks tools for reading documents.

## Stack

Next.js 16 App Router + TypeScript (root `proxy.ts`; `middleware.ts` is the deprecated name) · Tailwind + shadcn/ui (add components on demand) · Supabase (Postgres, Auth, Storage; Singapore) with RLS on every table · `@supabase/ssr` (not auth-helpers) · Zod · PapaParse · `pdfjs-dist` or `unpdf` for PDF text **with positions** (not pdf-parse) · `@anthropic-ai/sdk` and `openai` (only inside `lib/llm/providers/`) · Resend behind `lib/email/` · Vitest · Vercel. Eval: Python 3 in `eval/` (reportlab, pypdfium2, Pillow, pandas, matplotlib).

Not in MVP unless asked: queues, Python services, vision in the app (vision exists only for the eval), Gmail OAuth, inbox reading, BAST, PO candidate search, partial billing, full SoD, delegation of authority, bank-change workflow, LangGraph/MCP/agent frameworks, fine-tuning.

## LLM layer (product doc 6.5)

- App code calls only `generateStructured()` and `runToolLoop()` from `lib/llm`. Never import a provider SDK outside `lib/llm/providers/`.
- `LLM_PROVIDER` selects the provider (`deepseek` | `anthropic`, D23). Development and the demo run on DeepSeek through `lib/llm/providers/openai-compatible.ts`; `lib/llm/providers/anthropic.ts` stays tested and is the path for vision and eval comparisons.
- The `openai` package, like `@anthropic-ai/sdk`, is allowed only inside `lib/llm/providers/`.
- **Synthetic/demo data only.** DeepSeek processes data on its own servers (China). Real client invoices must not be sent to any provider until a per-client data-residency decision is made (D15, D23).
- Messages and tools use an internal format; the adapters translate.
- Models, effort, and the price table per purpose live in `lib/llm/config.ts`. On `anthropic` the defaults are `claude-sonnet-5-5` for extraction, agent, and chatbot and `claude-haiku-5-5` for match explanations; DeepSeek models come from `docs/llm-context/deepseek.md`. Never hardcode model strings elsewhere.
- Structured outputs: `output_config.format` with a JSON schema generated from Zod on Anthropic; the method confirmed in `docs/llm-context/deepseek.md` on DeepSeek. Zod validates anyway; retry once.
- Every prompt has a `PROMPT_VERSION` constant. Every call is logged to `llm_calls` (purpose, model, prompt_version, tokens, cost estimate, latency, ok, error_code) via `lib/llm/log-call.ts`.

## Domain vocabulary and enums (product doc 8)

- `DocumentStatus`: `UPLOADED → EXTRACTING → EXTRACTED | NEEDS_CORRECTION | EXTRACTION_FAILED | UNSUPPORTED_FORMAT`
- `MatchStatus`: `REJECTED | FULL_MATCH | PARTIAL_MATCH | NO_MATCH` + separate boolean `anomaly_flag`. There is no `MATCHED` or `ANOMALY` status.
- `VetoCode`: `VETO_VENDOR_NOT_FOUND | VETO_VENDOR_NOT_VERIFIED | VETO_BANK_MISMATCH | VETO_DUPLICATE_INVOICE`
- `ReviewStatus`: `PENDING_REVIEW → APPROVED | REJECTED_BY_REVIEWER`; `APPROVED → PAID` (approver only). No backward transitions.
- `VendorStatus`: `verified | unverified | suspended` — set by humans only
- `Role`: `admin | ap_staff | approver`
- `FieldConfidence`: `high | medium | low | manual` · `FieldVerification`: `verified | unverified | manual`
- `FollowupStatus`: `DRAFT → SENT | DISCARDED`
- `LlmPurpose`: `extract_invoice | extract_invoice_vision | explain_match | agent_followup | agent_reply | chatbot`

Critical extraction fields: `invoice_number`, `subtotal`, `total_amount`, `bank_account_number`, `npwp`. Any of them `null` or `unverified` → `NEEDS_CORRECTION`.

Indonesian terms: NPWP (tax ID), PO, DPP (pre-tax amount = `subtotal`), PPN (VAT = `tax_amount`), PKP (VAT-registered; non-PKP invoices have no PPN), rekening (bank account), BAST (goods receipt — deferred).

## Extraction checks contract (product doc 6.3–6.4)

- Every field: `{value, confidence, source_text}` from the LLM; checks add `signals {grounded, format_ok, arithmetic_ok}`, `evidence [{page, bbox}]`, `verification`.
- `verified` iff every applicable deterministic signal passes AND `confidence ≠ low`. Manual corrections → `manual`.
- Money parsing accepts `15.750.000,00`, `15,750,000.00`, with/without `Rp`. Dates: common Indonesian/English formats, `dd/mm` assumed.
- Arithmetic: `subtotal + tax_amount = total_amount` (±Rp 1; non-PKP: subtotal = total); Σ line_subtotal ≈ subtotal (±0.5%); qty × unit_price = line_subtotal (±Rp 1).
- Non-PKP (D24): `tax_amount` null or 0 is `verified` only if subtotal = total (±Rp 1), both verified or manual, and no tax keyword is on the page.
- `CHECKS_VERSION` is stored with every extraction.

## Matching engine contract (product doc 7)

Order is fixed: **veto → score → classify → anomaly**. Every number lives in `lib/matching/config.ts` as a named constant.

- Vendor identification: NPWP exact, else highest Jaro-Winkler name similarity ≥ `VENDOR_NAME_MATCH_MIN` (0.95), ties = not found → `VETO_VENDOR_NOT_FOUND`.
- Vetoes in order: not found, not verified, bank mismatch (number/bank/holder after normalization), duplicate (normalized invoice number + vendor already `APPROVED`/`PAID`). Veto → `REJECTED`, no score, never overridable. Bank has no score weight on purpose (D1).
- Score weights: PO 25 · vendor name 15 · amount (`subtotal` vs PO total, full ≤ 0.5%, linear to 0 at 5%) 25 · line items 20 · consistency 15 (5 lines≈subtotal, 5 tax arithmetic, 5 date order). Sum = 100.
- Classify: PO not found (missing / not in org / other vendor) → `NO_MATCH`; else `FULL_MATCH ≥ 90`, `PARTIAL_MATCH ≥ 60`, else `NO_MATCH`. No PO candidate search.
- Anomaly: ≥ 6 PAID invoices in 24 months → flag if total > 3 × mean; else flag if total > Rp 500.000.000. Never on `REJECTED`.
- Jaro-Winkler is hand-written in `lib/matching/similarity.ts` with reference-value tests. No fuse.js.
- Pending duplicate (same normalized number + vendor still `PENDING_REVIEW`) → display-only warning, not a veto.

Tests first for every deterministic folder; 100% coverage on `lib/matching`.

## Review rules (product doc 7.5, 9; code in `lib/review/`)

- Uploader of the document cannot approve/reject its match → 403 (SoD, D7). Investigation notes are allowed.
- `FULL_MATCH`, no anomaly, total < `REVIEW_HIGH_AMOUNT` (Rp 100.000.000) → one click.
- `FULL_MATCH`, total ≥ `REVIEW_HIGH_AMOUNT` → tick evidence for every critical field.
- `PARTIAL_MATCH` / `NO_MATCH` → tick every flagged item (each score component below max, each unverified field) + reason.
- `anomaly_flag` → ticks + reason ≥ `ANOMALY_REASON_MIN_CHARS` (20).
- `REJECTED` → no approve path in UI or API; investigation note only.
- Corrections (D25): `REJECTED` match → 409 `VETO_LOCKED` for every field; the path out is an investigation note + a new document. Decided match → 409 `DECISION_LOCKED`. Allowed only with no match yet, or `PENDING_REVIEW` and not `REJECTED`.
- A manually corrected field not grounded in the document is shown as "nilai manual, tidak ada di dokumen" and is a required tick on every non-veto match, one-click included (D25).
- Reject always needs a reason. Mark PAID: approver only (admin cannot), from `APPROVED` only.
- Server recomputes required items with `requiredReviewItems()` and rejects (400) incomplete submissions. Every review writes `review_sessions` + `audit_logs`.
- AI-written text (explanations, drafts) is labelled "Dibuat AI" in the UI.

## Follow-up agent rules (product doc 10)

- Eligible: `PARTIAL_MATCH`, `NO_MATCH`, anomaly-flagged, `REJECTED` with `VETO_BANK_MISMATCH`.
- Recipient = `vendors.contact_email` only, re-read at send time. Never from the invoice, a reply, or LLM output. No contact → no draft.
- Tools: `get_followup_context` (match bound server-side), `save_draft`, `propose_po_number` (suggestion, validated by code), `flag_suspicious` (display only). **No send tool. No tool that writes vendor, bank, status, or invoice data.**
- Loop built on `runToolLoop()` from `lib/llm`, with `MAX_AGENT_ITERATIONS` (6) in `lib/agent/config.ts`.
- Sending = `POST /api/followups/[id]/send`, triggered by a human. `EMAIL_MODE=dry_run` by default.
- Pasted vendor replies are untrusted data, wrapped as data in prompts. `lib/followup-checks` detects bank-change requests deterministically; flags only warn.
- Accepting a proposed PO goes through the normal audited correction flow and re-runs matching.

## Data access rules

- Every table has `organization_id` + RLS scoped to the caller's org, from its first migration.
- `anon` and `authenticated` are **read-only** on every table (D21): INSERT/UPDATE/DELETE/TRUNCATE are revoked. Org-scoped SELECT policies stay.
- All writes go through server API routes via `lib/server/write-context.ts`: verify session, load profile (role, organization_id), apply role/SoD/`lib/review` checks, then write with the service-role client (`lib/supabase/admin.ts`) filtering `organization_id` explicitly. No route writes without it.
- Chatbot and agent tools **read** with the user-scoped server client (RLS active), never `admin.ts`. Agent writes (`save_draft`, reply records) go through server functions that take `organization_id` from the session, never from the LLM.
- `profiles.role` changes only through an admin route or the seed; no self-service. Users are never deleted, only deactivated (`profiles.deactivated_at`).
- `audit_logs` is append-only via REVOKE + trigger (blocks service role too); its FKs never use `ON DELETE SET NULL/CASCADE`. Never work around it.
- Files live in bucket `documents` at `{organization_id}/{document_id}.pdf` and are never deleted.
- Role checks happen server-side from `profiles.role`.

## Eval rules (product doc 12)

- One extraction implementation: `scripts/extract-batch.ts` runs the app's `lib/llm` + `lib/extraction-checks` (no DB) and writes JSONL. Python in `eval/` only generates PDFs and analyzes JSONL; it never re-implements extraction.
- `eval/generate.py` (fixed seed) also regenerates `fixtures/invoices/`.
- Vision extraction is used only by the eval in MVP. In the app, scanned PDFs stay `UNSUPPORTED_FORMAT`.
- `npm run eval:smoke` must pass after any `PROMPT_VERSION` change.

## Conventions

- UI labels and LLM-written text in Indonesian; code, comments, commits, tests in English.
- Money: `numeric(18,2)`, IDR default; compare with tolerances from config, never `===` on floats.
- Dates: ISO 8601 at the API boundary; `date` columns.
- API responses: `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`; 400 validation, 401, 403 role/SoD, 404, 409 invalid transition.
- Validate every request body, CSV row, and LLM output with Zod.
- Keep zone folders separate; the boundary must be visible in the file tree.

## How to work with me

- Read the referenced product-doc sections before planning. Don't guess weights, columns, statuses, or role rules; they are specified. If something is missing, ask.
- Present a plan before writing code; keep a todo list for the session and work through it part by part.
- Run the verification for each part before moving on; commit at the end of each phase with `phase N:` in the message.
- If a request would move a decision into the AI zone or let an LLM touch a state transition or send email, push back and cite this file.
- Fixtures are in `fixtures/`; generate data with `eval/generate.py` instead of inventing sample data.
- Tests that write data use the "RLS Audit Fixture" organization, never Demo Corp (D22).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
