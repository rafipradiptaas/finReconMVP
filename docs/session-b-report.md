# Session B report — stopped early

**The run hit a hard stop: `ANTHROPIC_API_KEY` is empty in `.env.local`.** Session B is not finished. Phase 3 is partly done and Phase 4 was not started. Details: `docs/review-queue.md`, "HARD STOP".

Nothing was pushed or merged. All work is on the local branch `session-b`.

## Done

| Part | Result |
|---|---|
| 1. Decision log | Already done in `20311b2`; no change |
| 2. Other docs | Already done in `20311b2`; checked item by item, no leftovers |
| 3. D22 code | Code was already in `20311b2`. Migration 0003 had never been applied: applied, verified, tests added |
| Phase 3 | Steps 1–4 done, step 7 written but unverified, steps 5–6 not started |
| Phase 4 | Not started |

| Phase 3 step | Status |
|---|---|
| 1. Generator, fixtures | Done |
| 2. Document router | Done |
| 3. Extraction checks | Done |
| 4. `lib/llm` | Done with a mocked provider; never run against the real API |
| 5. Upload route | **Not started** |
| 6. Documents UI, correction route | **Not started** |
| 7. `extract:batch`, `eval:smoke` | Scripts written; **never completed a real run** |

## Commits

| Hash | Message |
|---|---|
| `6cfb014` | phase 2: follow-ups (D22) |
| `8082da8` | phase 3: generator, document router, extraction checks, llm layer |
| final commit on `session-b` | phase 3: extract-batch and eval:smoke scripts, hard stop report |

## Check results

| Check | Result |
|---|---|
| `npm test` | 17 files, 264 tests passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| Generator determinism | Two runs identical during development. Combined hash of the final output: `a40b871a06505b9c178d23d79e899f5a9ccaa9e3` (one run; repeat below) |
| Migration 0003 | Applied. Constraint present, `document_id` nullable, anon cannot execute `current_org_id()`, authenticated can |
| Migration 0004 | Applied. Bucket is private, policy present |
| `npm run db:types` | **Fails**: Supabase CLI not logged in. Types patched by hand |

## Fixture outcomes

Matching does not exist yet, so **no match outcome has been tested**. The table shows document status only, with ground truth standing in for the LLM. This proves the PDFs and the checks agree, not that a real extraction works.

| Fixture | Expected status | Actual (perfect read) | Expected match | Actual match |
|---|---|---|---|---|
| 01 | EXTRACTED | EXTRACTED | FULL_MATCH | not built |
| 02 | EXTRACTED | EXTRACTED | PARTIAL_MATCH | not built |
| 03 | EXTRACTED | EXTRACTED | REJECTED / VETO_BANK_MISMATCH | not built |
| 04 | NEEDS_CORRECTION | NEEDS_CORRECTION | FULL_MATCH after correction | not built |
| 05 | EXTRACTED | EXTRACTED | FULL_MATCH | not built |
| 06 | EXTRACTED | EXTRACTED | FULL_MATCH + anomaly | not built |
| 07 | EXTRACTED | EXTRACTED | REJECTED / VETO_VENDOR_NOT_VERIFIED | not built |
| 08 | EXTRACTED | EXTRACTED | NO_MATCH | not built |
| 09 | EXTRACTED | EXTRACTED | REJECTED / VETO_VENDOR_NOT_FOUND | not built |
| 10 | UNSUPPORTED_FORMAT | under the 50-character threshold | none | none |

All 12 eval documents also reach EXTRACTED with a perfect read.

## Claude API calls

**0 of 5 reached the API.** One attempt failed locally with no credentials: no tokens, no charge, 0 rows in `llm_calls`. End-to-end extraction has **not** been confirmed.

## To run tomorrow

```bash
# 1. Put the key in .env.local, then confirm extraction on one fixture (1 call)
mkdir -p /tmp/one && cp fixtures/invoices/01_full_match_V001.pdf /tmp/one/
npm run extract:batch -- /tmp/one --out /tmp/one.jsonl

# 2. Confirm types match 0003 (expect no diff)
npx supabase login && npm run db:types && git diff --stat types/

# 3. Generator determinism (expect the same hash twice)
.venv/bin/python eval/generate.py && shasum fixtures/invoices/* eval/data/pdfs/* eval/data/ground_truth/* | shasum
.venv/bin/python eval/generate.py && shasum fixtures/invoices/* eval/data/pdfs/* eval/data/ground_truth/* | shasum

# 4. After the remaining work is built
npm run eval:smoke                # about 10 paid calls
npm test -- --coverage            # lib/matching must reach 100%
# Upload each fixture through /documents and compare with fixtures/README.md
```

## Continue prompt

Paste after setting the key:

```
Read CLAUDE.md and docs/decisions/2026-10-31-v3.md. We are in Session B of docs/dev-guide.md. Read that session's prompt in section 3 and the product-doc sections it lists, plus docs/review-queue.md.
Current state: on branch session-b, Phase 3 steps 1–4 are done, step 7's scripts are written but unverified, steps 5–6 and Phase 4 are not started. The run stopped because ANTHROPIC_API_KEY was empty.
Run git log --oneline -15 and the test suite, confirm extraction on one fixture with npm run extract:batch, then rebuild the todo list and continue from Phase 3 step 5. Fix the "Known issues" in docs/review-queue.md first. Keep the same STOP points.
```

## What to review, in priority order

1. **`lib/extraction-checks/`** line by line: [review section](review-queue.md#review-lib-extraction-checks-replaces-stop-1).
2. **`supabase/migrations/0004_documents_bucket.sql`**: new and already applied; you did not ask for it. See Decision 14.
3. **`lib/llm/`**, especially the prompt in `extract-invoice.ts`. It has never run on a real model.
4. **Regenerated fixture PDFs** and `eval/data/table.csv`. See Decision 16.
5. **[Decisions I took](review-queue.md#decisions-i-took)**: 16 items.

`lib/matching` has nothing to review yet.

## What you must do manually

- Set `ANTHROPIC_API_KEY` in `.env.local`.
- Run `npx supabase login`. No SQL needs running by hand: 0003 and 0004 are both applied.

## Unresolved

- Phase 3 steps 5–6 and all of Phase 4 are not built.
- See "Known issues" in `docs/review-queue.md`: the error logging gap, D13 not yet proven, and the schema never seen by the real API.
- Vercel limits request bodies to about 4.5 MB, which will cap upload size when step 5 is built.
