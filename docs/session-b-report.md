# Session B report

**Session B is complete: Phases 3 and 4 are done, tested and committed on the local branch `session-b`.** Nothing was pushed or merged.

The first attempt stopped on an empty `ANTHROPIC_API_KEY`. D23 then moved development to DeepSeek, and the session finished on that provider. All data sent to DeepSeek was synthetic.

## What was done

| Part | Result |
|---|---|
| Decision log | D23 (DeepSeek) and D24 (non-PKP tax) added and reflected in CLAUDE.md and product-doc |
| D22 follow-ups | Migration 0003 applied and verified, tests added |
| Migration 0004 | `documents` bucket, approved by you, applied and verified |
| Error codes | Missing key, auth rejected, rate limit, provider error, network error and schema-invalid are separate. Added `insufficient_balance` and `bad_request` |
| Phase 3 | Generator, router, extraction checks, LLM layer with both adapters, upload route, documents UI with evidence highlights, correction route, `extract:batch`, `eval:smoke` |
| Phase 4 | Matching engine, integration on upload and correction, `/matches` |

## Commits

| Hash | Message |
|---|---|
| `6cfb014` | phase 2: follow-ups (D22) |
| `8082da8` | phase 3: generator, document router, extraction checks, llm layer |
| `5f4f74f` | phase 3: extract-batch and eval:smoke scripts, hard stop report |
| `0146a3c` | docs: D23 |
| `481ba2f` | phase 3: error codes |
| `1cf1a46` | phase 3: deepseek adapter |
| `b52be30` | docs: record DeepSeek live check |
| `0c28270` | phase 3: non-PKP tax rule (D24), bank names, smoke totals |
| `dd0021b` | phase 3: upload and documents UI |
| `c8852cc` | phase 4: matching tests (failing, implementation next) |
| `06b7544` | phase 4: matching engine, integration, /matches |
| `86c3e19` | phase 4: show no review state on REJECTED, README status |
| latest | docs: session B report |

## Check results

| Check | Result |
|---|---|
| `npm test` | 30 files, 534 tests passed, including the real-database integration tests |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `npm run build` | Passed |
| `lib/matching` coverage | 100% statements, branches, functions and lines |
| Mutation check | 20 changes to `lib/matching/config.ts`, covering every weight, threshold and tolerance: each one failed at least one test |
| Hardcoded numbers | No score, threshold or tolerance outside `lib/matching/config.ts` (grep) |
| Generator | Two runs identical: `a40b871a06505b9c178d23d79e899f5a9ccaa9e3` |
| Zone boundaries | Deterministic folders import nothing from the AI zone; provider SDKs stay in `lib/llm/providers/`; the vision path is unreachable from the app (`tests/zones.test.ts`) |
| `npm run eval:smoke` | **Passed.** Critical-field accuracy 50/50, 0 wrong while verified, 10 calls, 20,793 + 7,331 tokens, $0.0150 (ceiling) |

## Fixture outcomes

Uploaded through the running app in Chrome, with live DeepSeek, in the RLS Audit Fixture organization. Master data and 138 history rows were loaded from `fixtures/`, then removed. **Actual matched expected on all 10.**

| Fixture | Expected | Actual | Score |
|---|---|---|---|
| 01 | FULL_MATCH | FULL_MATCH | 100 |
| 02 | PARTIAL_MATCH | PARTIAL_MATCH | 66.11 |
| 03 | REJECTED / VETO_BANK_MISMATCH | REJECTED / VETO_BANK_MISMATCH | - |
| 04 | NEEDS_CORRECTION → FULL_MATCH | NEEDS_CORRECTION → corrected → FULL_MATCH | 100 |
| 05 | FULL_MATCH | FULL_MATCH | 100 |
| 06 | FULL_MATCH + anomaly | FULL_MATCH + anomaly, 8.7× the mean of 14 PAID invoices | 100 |
| 07 | REJECTED / VETO_VENDOR_NOT_VERIFIED | REJECTED / VETO_VENDOR_NOT_VERIFIED | - |
| 08 | NO_MATCH | NO_MATCH | 25 |
| 09 | REJECTED / VETO_VENDOR_NOT_FOUND | REJECTED / VETO_VENDOR_NOT_FOUND | - |
| 10 | UNSUPPORTED_FORMAT | UNSUPPORTED_FORMAT | - |
| 01 again, first pending | FULL_MATCH + warning | FULL_MATCH + warning on `/matches` | 100 |
| 01 again, first approved | REJECTED / VETO_DUPLICATE_INVOICE | REJECTED / VETO_DUPLICATE_INVOICE | - |

D13 holds: fixture 09's closest master vendor is V001 at 0.9398, below 0.95, and its NPWP is not in master data.

The history rows were inserted directly for this run. Until the Phase 8 import exists, fixture 06 **will not flag an anomaly in the demo organization**: it falls back to the Rp 500 jt threshold.

## LLM use

About 40 successful DeepSeek calls on `deepseek-flash`, roughly $0.06 at peak rates (an upper estimate). `llm_calls` recorded model, tokens, cost and latency for each of the 11 calls in the fixture run. No Claude API calls: `ANTHROPIC_API_KEY` is empty, so the Anthropic adapter has only been tested with mocks.

## Read the accuracy numbers with care

- **The 50/50 is optimistic.** It comes from clean synthetic PDFs, and `eval:smoke` scores only the 5 critical fields.
- **Thinking is off for extraction.** Strict tool calling requires it, so `effort` has no effect there. Nothing shows this hurting accuracy, but this data is too easy to prove it. Session D should compare `json_object` with thinking on.

## What to review, in priority order

1. **`lib/matching/`** line by line, especially `veto.ts`: [test list](review-queue.md#review-libmatching-tests-replaces-stop-2).
2. **`lib/extraction-checks/`**, including the D24 rule in `index.ts`: [review section](review-queue.md#review-libextraction-checks-replaces-stop-1).
3. **`lib/server/process-document.ts`, `lib/server/match-document.ts`, `app/api/documents/[id]/correct/route.ts`**.
4. **`lib/llm/providers/openai-compatible.ts`** and the prompt in `lib/llm/extract-invoice.ts`.
5. **[Decisions I took](review-queue.md#decisions-i-took)**: 34 items. You have already confirmed 27–31.

## What you must do manually

- Run `npx supabase login && npm run db:types`, then check `git diff --stat types/`. The CLI was not logged in, so the 0003 types were patched by hand. Expect no diff.
- Set `LLM_PROVIDER` and `DEEPSEEK_API_KEY` in Vercel before testing staging.
- Run the "Verifikasi Sesi B" checklist in `docs/dev-guide.md` as a Demo Corp user. My browser runs used the fixture organization, so Demo Corp has not been exercised.
- Merge `session-b` when you are satisfied.

## Unresolved

- **Line items cannot be corrected.** Scalar fields are editable; line items are read-only in the form and the API (Decision 24). A misread line can only be fixed by uploading again.
- **A matching failure leaves no match row.** The route returns a 500, the document stays EXTRACTED, and any correction re-runs matching.
- **Upload limit is 4 MB,** because of Vercel's request size limit.
- **DeepSeek cost is a ceiling:** peak rate, with cache hits ignored.
- **The browser checks are not in the repo.** They ran from a throwaway script. Add Playwright if you want them in CI.
- **`npm test -- --coverage`** reports `lib/matching` and `lib/extraction-checks` together. `lib/extraction-checks` is at 97.8% statements and 90.05% branches, so its uncovered branches are still to review. It has no 100% requirement.
