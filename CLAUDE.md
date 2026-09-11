# FinRecon AI — CLAUDE.md

B2B SaaS pre-payment control layer for corporate Accounts Payable (Indonesia). Reads vendor invoices with an LLM, matches them against purchase orders and vendor master data with deterministic code, rejects risky payments with hard rules, routes grey cases to human review, and keeps an immutable audit trail.

The full specification is `docs/product-doc-v2.md`. The phase-by-phase plan is `docs/dev-guide.md`. When this file and the product doc disagree, the product doc wins — tell the user about the conflict.

## The one rule that matters most: AI zone vs deterministic zone

**AI (LLM) is only used for interpretive work.** Every financial decision is made by ordinary deterministic code.

| Zone | Folders | May do | Must never do |
|---|---|---|---|
| AI | `lib/llm/`, `lib/chatbot/` | Extract fields from PDF text, assign per-field confidence, write Indonesian explanations from values it is given, answer chatbot questions from tool results | Decide match status, compute scores, approve/reject, mark paid, write to `matches.status`/`review_status`, read data outside the org session |
| Deterministic | `lib/document-router/`, `lib/matching/`, `lib/audit.ts`, all API route decision logic | Everything decision-related | Import from `lib/llm/` or `lib/chatbot/`; call any network/LLM |

Concrete consequences:
- `lib/matching/**` and `lib/document-router/**` must not import anything from `lib/llm/**` or `lib/chatbot/**`. If you find yourself needing to, stop and ask.
- `lib/matching/**` is pure: no I/O, no Supabase, no `Date.now()` without injection. Inputs in, `MatchResult` out.
- LLM output is data, never a command. It is validated with Zod and stored; it never triggers a state transition by itself.
- When the LLM fails (timeout, invalid JSON, API error), the pipeline continues. Explanations become `null`; extraction goes to `EXTRACTION_FAILED`. Never let an LLM error block or alter a deterministic decision.
- Numbers, account numbers, and names in any LLM-written text must come from the input we passed it. Never ask the LLM to "figure out" a value that exists in the database.
- `organization_id` always comes from the server session (`profiles.organization_id` for `auth.uid()`). It is never a request parameter, never a chatbot tool argument, never trusted from the client.

## Stack (MVP)

Next.js 16 App Router + TypeScript (root `proxy.ts`, not `middleware.ts` — deprecated in Next 16) · Tailwind + shadcn/ui · Supabase (Postgres, Auth email/password, Storage; region Singapore) with RLS on every table · `@supabase/ssr` (not the deprecated auth-helpers) · Zod · PapaParse · pdf-parse · `@anthropic-ai/sdk` · Vitest · deployed on Vercel.

LLM: one Claude Sonnet model for both extraction and explanations. Check `docs/llm-context/` or docs.claude.com for the current model string before hardcoding; put it in one constant in `lib/llm/client.ts`. Force JSON via tool-use (`tool_choice` forcing a single tool whose input schema is the Zod schema converted to JSON Schema), then validate with Zod anyway.

Not in MVP (do not add unless asked): Python services, queues, vision/OCR for scanned PDFs, WhatsApp/email, bank/ERP/DJP integrations, OAuth, BAST/three-way matching, full SoD, delegation of authority, vendor bank-change workflow.

## Domain vocabulary and enums

Source of truth is product doc section 8. Summary:

- `DocumentStatus`: `UPLOADED → EXTRACTING → EXTRACTED | NEEDS_CORRECTION | EXTRACTION_FAILED | UNSUPPORTED_FORMAT`
- `MatchStatus`: `REJECTED | FULL_MATCH | PARTIAL_MATCH | NO_MATCH` (plus a separate boolean `anomaly_flag`)
- `VetoCode`: `VETO_VENDOR_NOT_FOUND | VETO_VENDOR_NOT_VERIFIED | VETO_BANK_MISMATCH | VETO_DUPLICATE_INVOICE`
- `ReviewStatus`: `PENDING_REVIEW → APPROVED | REJECTED_BY_REVIEWER`; `APPROVED → PAID` (approver only). No backward transitions.
- `VendorStatus`: `verified | unverified | suspended` — set by humans, never by the system
- `Role`: `admin | ap_staff | approver` — all approvers are equal
- `FieldConfidence`: `high | medium | low | manual`
- Critical extraction fields: `invoice_number`, `total_amount`, `bank_account_number`, `npwp`. Any of these `low`/`null` → `NEEDS_CORRECTION`.

Indonesian terms you will see: NPWP (tax ID), PO (purchase order), BAST (goods receipt — deferred), rekening (bank account), vendor terverifikasi (verified vendor).

## Matching engine contract

Order is fixed: **veto → score → classify → anomaly**. All weights and thresholds live in `lib/matching/config.ts` as named constants; nothing numeric is hardcoded elsewhere.

- Veto hits → `REJECTED`, score not computed, cannot be overridden by anyone.
- Score 0-100 per product doc 7.2. `FULL_MATCH ≥ 90`, `PARTIAL_MATCH 60-89.99`, `NO_MATCH < 60` or PO not found.
- Anomaly: vendor with ≥ 6 PAID invoices in 24 months → flag if `total_amount > 3 × mean`; otherwise absolute threshold. Never applied to `REJECTED`.
- String similarity: Jaro-Winkler implemented in `lib/matching/similarity.ts` with unit tests against reference values. Do not add fuse.js.
- Normalization before any comparison: strip whitespace/punctuation, uppercase; NPWP and account numbers digits-only.

Write tests before implementation for anything in `lib/matching/`. Target 100% coverage there.

## Review rules (enforced server-side, mirrored in UI)

- `FULL_MATCH` → approve without reason.
- `PARTIAL_MATCH` / `NO_MATCH` / anomaly-flagged → approve **requires** a reason (this is an override); reject requires a reason.
- `REJECTED` (veto) → no approve/override path at all; only an investigation note.
- Mark PAID: `approver` only, from `APPROVED` only.
- `ap_staff` cannot import CSVs or use the chatbot. Chatbot: `approver` and `admin`.

Every state change and every manual field correction writes to `audit_logs` via `lib/audit.ts` with `old_value`/`new_value`/`reason`. `audit_logs` is append-only at the database level (revoked UPDATE/DELETE + trigger). Never work around that.

## Data access rules

- Every table has `organization_id` and an RLS policy scoped to the caller's org. New tables must follow this from their first migration.
- Server code that uses the service-role client (`lib/supabase/admin.ts`) must filter by `organization_id` explicitly — RLS does not protect service-role queries.
- Uploaded files live in Storage bucket `documents` at `{organization_id}/{document_id}.pdf` and are never deleted (audit).
- Role checks happen in API routes from `profiles.role`, never from the client.

## Conventions

- Language: UI labels and LLM-generated text in Indonesian; code, comments, commits, and tests in English.
- Money: store as `numeric(18,2)`, currency `IDR` default; compare with relative tolerance from `config.ts`, never `===` on floats.
- Dates: ISO 8601 strings at the API boundary; `date` columns in Postgres.
- API routes return `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }` with proper HTTP status (400 validation, 401 unauthenticated, 403 role, 404, 409 invalid transition).
- Validate every request body, every CSV row, and every LLM output with Zod.
- shadcn components are added on demand; don't install the whole library.
- Keep `lib/document-router`, `lib/matching`, `lib/llm`, `lib/chatbot` as separate folders — the boundary must be visible in the file tree.

## How to work with me (the user)

- Read the referenced product doc sections before planning. Don't guess weights, column names, statuses, or role rules — they are all specified.
- Present a plan and wait for approval before writing code in each phase.
- Stay inside the current phase's "done" definition from `docs/dev-guide.md`. If something seems missing from the spec, ask instead of inventing it.
- If a request would move a decision into the AI zone, or let an LLM touch a state transition, push back and cite this file.
- Prefer small, reviewable diffs. One phase per branch.
- Fixtures are in `fixtures/`; use them in tests and eval scripts rather than inventing sample data.`