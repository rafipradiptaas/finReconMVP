# Review queue — overnight Session B run

Written during the unattended run on branch `session-b`. Every "STOP and show me" from the Session B prompt became a section here. Nothing was pushed or merged.

## Run checklist

- [x] Part 1 — D19, D20, D22 in the decision log (already in `20311b2`, nothing to do)
- [x] Part 2 — D19/D20/D22 reflected in CLAUDE.md, product-doc, dev-guide (already in `20311b2`, checked item by item)
- [x] Part 3 — D22 code + migration 0003 applied and verified
- [x] Phase 3.1 generator + fixtures
- [x] Phase 3.2 document router
- [x] Phase 3.3 extraction checks (review section below)
- [x] Phase 3.4 lib/llm
- [ ] Phase 3.5 upload route
- [ ] Phase 3.6 documents UI + correction
- [ ] Phase 3.7 extract-batch + eval:smoke
- [ ] Phase 4.8 matching tests (review section below)
- [ ] Phase 4.9 matching engine
- [ ] Phase 4.10 integration + /matches
- [ ] Part 5 final report

## Decisions I took

1. **No Claude co-author trailer on commits.** Your standing rule says no trailer, and that rule beats the session's attribution reminder. Your run rules replace the "approve each commit message" step for this run only.
2. **`types/database.types.ts` was patched by hand for 0003** (three `document_id` lines). `npx supabase` is not logged in, so `npm run db:types` fails with `AccessTokenRequiredError`. Those lines are the only public-schema change in 0003. Confirm with `npx supabase login && npm run db:types`; expect no diff.

3. **`pdfjs-dist` and `unpdf` are both installed.** `unpdf` reads text on the server, where plain pdf.js needs canvas polyfills; `pdfjs-dist` renders pages in the browser, where `unpdf` adds nothing.
4. **`source_text` is a plain string on the wire, `""` = none,** and maps back to `null` in `lib/llm/extract-invoice.ts`. The API allows 16 union-typed parameters per request (`docs/llm-context/anthropic-structured-outputs.md`). A nullable `source_text` on all 11 scalar fields would be 22 and return a 400. The domain format still matches product doc 6.2, and `tests/llm/anthropic-adapter.test.ts` asserts the limit.
5. **Zod validation and the retry live in `lib/llm/index.ts`, not in the adapter.** The dev guide says the adapter does them. They are provider-neutral, so a second adapter would otherwise have to repeat them. The adapter only translates.
6. **Only invalid output is retried** (bad JSON, schema-invalid). A provider error or a refusal is final, because the SDK already retries 429/5xx and a second try at a 401 is wasted.
7. **No server-side refusal fallback.** It would silently change the model in an audited pipeline, and a refusal already ends in `EXTRACTION_FAILED`.
8. **Default effort:** extraction `high` (the model's default, the eval measures lower per D19), agents `medium`, chatbot and match explanation `low`.
9. **A `tax_amount` of 0 skips `grounded`,** because non-PKP invoices usually print no tax line. Arithmetic still applies. Fixture 05 is this case.
10. **`locateEvidence` returns every occurrence** of a snippet, not the first, so a value printed twice highlights twice.
11. **`null` signal = not applicable.** With no text layer (vision path), `grounded` is `null` rather than `false`, otherwise every scanned document would be unverified by construction.
12. **Fixture 09 is renamed** "PT Sinar Logistik Antarpulau" (D13). Fixture 10's image is drawn with Pillow and carries invented text, since the old generator is gone. Its ground truth stays all-null.
13. **Eval set has 12 documents for now** (10 for smoke + 2). The ≥ 40 target belongs to Session D, per the dev guide's Phase 6 step 1.

## Doc conflicts found (nothing changed)

- D10 still says "Loop: Anthropic SDK tool use, own loop in lib/agent/". D19 refines this to `runToolLoop`; CLAUDE.md, product-doc and dev-guide already say so. The D10 line was left as written because the decision log is a record.

## Review: lib/extraction-checks (replaces STOP 1)

**Read line by line:** `lib/extraction-checks/normalize.ts`, `signals.ts`, `verify.ts`, `locate-evidence.ts`, `index.ts`, `config.ts`.

**Tests:** `tests/extraction-checks/normalize.test.ts`, `signals.test.ts`, `locate-evidence.test.ts`, `verify.test.ts`, `generated-documents.test.ts`. All required cases are covered: "15.750.000,00", "15,750,000.00", "Rp15.750.000", "15.750" = 15750, Indonesian month names, dd/mm, value present vs absent, O-vs-0 invoice number, non-PKP arithmetic, ±Rp 1 boundary, line arithmetic.

**Written test-first; the tests found three real bugs on the way:**
- A truncated account was grounded: `12345678` matched `1234-5678 90`. `groundedDigits` now refuses a number that continues after a single separator.
- A correct date was not grounded on the `banner` layout: `PO-2026-004  TANGGAL  2026-07-21` read as "04 TANGGAL 2026" and swallowed the real date's year. Date patterns are now scanned separately, with a regression test.
- pdf.js in this version has no `destroy()`; the call was removed.

`generated-documents.test.ts` runs each generated PDF through the real router and the checks, with ground truth standing in for the LLM, so every format is exercised on real documents at no API cost.

**Output:** `162 passed` at this point for `tests/extraction-checks`, `tests/llm`, `tests/document-router`, `tests/zones.test.ts`.
