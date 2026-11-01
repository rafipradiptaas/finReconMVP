# Review queue — overnight Session B run

Written during the unattended run on branch `session-b`. Every "STOP and show me" from the Session B prompt became a section here. Nothing was pushed or merged.

## HARD STOP: ANTHROPIC_API_KEY is missing

The run ended here, as the run rules require. Nothing else blocked it.

- `.env.local` has `ANTHROPIC_API_KEY=` with an empty value. It is not in the shell environment either, and the `ant` CLI is not installed, so there is no profile to fall back on.
- The SDK reports: `Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.`
- `npm run extract:batch` on fixture 01 returned `EXTRACTION_FAILED / provider_error` after 9 ms. Nothing reached the API: no tokens, no charge, 0 rows in `llm_calls`.
- I did not look for a key anywhere else on the machine.

**To resume:** set the key in `.env.local`, then use the Continue prompt in `docs/session-b-report.md`.

## Step 3 live check (1 Nov)

Waiting for your review before Phase 3 steps 5–6 start.

- `npm run extract:batch` on fixtures 01, 04 and 05: 3 calls, no retries. Statuses as expected: EXTRACTED, NEEDS_CORRECTION, EXTRACTED.
- `npm run eval:smoke` on ev01–ev10: critical-field accuracy 50/50, wrong while verified 0, passed. It scores the 5 critical fields only, on synthetic documents, and does not print cost.
- `deepseek-flash`, strict tool calling, thinking off.

**Found for Phase 4:** the extractor returns `Bank BCA` and `Bank Mandiri`, while master data says `BCA` and `Mandiri`. `grounded` passes, but the bank veto needs a name normalizer that strips "Bank", or every invoice would be `VETO_BANK_MISMATCH`.

**Your call:** a non-PKP invoice with no tax line gets `tax_amount` null, confidence low, `unverified` (fixture 05). The document still reaches EXTRACTED, and `FULL_MATCH` review ignores it, but on `PARTIAL_MATCH`/`NO_MATCH` that null would become a required tick. That follows the D5 rule as written.

## Run checklist

- [x] Part 1 — D19, D20, D22 in the decision log (already in `20311b2`, nothing to do)
- [x] Part 2 — D19/D20/D22 reflected in CLAUDE.md, product-doc, dev-guide (already in `20311b2`, checked item by item)
- [x] Part 3 — D22 code + migration 0003 applied and verified
- [x] Phase 3.1 generator + fixtures
- [x] Phase 3.2 document router
- [x] Phase 3.3 extraction checks (review section below)
- [x] Phase 3.4 lib/llm
- [x] Phase 3.5 upload route
- [x] Phase 3.6 documents UI + correction
- [x] Phase 3.7 extract-batch + eval:smoke
- [x] Phase 4.8 matching tests (written, waiting for your review)
- [x] Phase 4.9 matching engine
- [x] Phase 4.10 integration + /matches
- [x] Part 5 final report (`docs/session-b-report.md`, stopped early)

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

14. **Migration `0004_documents_bucket.sql` was added and applied.** It was not in your list, but the `documents` bucket did not exist and the upload step needs it. It creates a private bucket and an org-scoped SELECT policy on `storage.objects`. There is no write policy, in line with D21. Please review it.
15. **`.venv/bin/python` runs the generator,** because reportlab is not in the system `python3`. The dev guide's `python3 eval/generate.py` works once the venv is active.
16. **Your fixture PDFs were replaced** by generated ones, as the Session B prompt asks; the originals remain in git history. Ground truth is unchanged except fixture 09's name, holder and invoice number (D13) and two metadata keys on fixture 10.

## Known issues to fix when work resumes

- ~~A local failure is logged only as `provider_error`.~~ Fixed: distinct codes in `lib/llm/errors.ts`, and the underlying message is printed.
- A failure inside matching after a document reaches EXTRACTED returns a 500 and leaves the document with no match. Any correction re-runs matching. Add a retry if this is ever seen in practice.

17. **DeepSeek structured output uses strict tool calling** (`DEEPSEEK.structuredMethod`), as the docs confirm it. It needs the `/beta` URL and `thinking: disabled`, because a named `tool_choice` returns 400 in thinking mode. So `effort` has no effect on extraction in this mode. `json_object` is implemented too, keeps thinking on, and is one config value away.
18. **`deepseek-flash` is the default for every DeepSeek purpose.** `deepseek-v4-pro` is reachable with `--model`; the eval decides (D23).
19. **DeepSeek cost is a ceiling:** the peak rate, ignoring cache hits. Off-peak is half.
20. **`missing_api_key` for Anthropic checks the two env vars,** so an `ant` CLI profile alone would read as missing. This project configures keys through env only.
21. **A 402 from DeepSeek has its own code,** `insufficient_balance`, and 400/422 have `bad_request`, beyond the list you asked for. Each points at a different fix.

22. **A non-PDF upload gets a 400 and stores nothing,** rather than a document row at `UNSUPPORTED_FORMAT`. Storage paths always end in `.pdf`, and files are never deleted. A corrupt PDF does get a row and `UNSUPPORTED_FORMAT`.
23. **Upload limit is 4 MB,** because Vercel rejects request bodies over about 4.5 MB.
24. **Line items are read-only in the correction form and API.** Scalar fields are editable. Add this in Phase 5 if reviewers need it.
25. **A correction that would break a critical field on an EXTRACTED document returns 400.** `DocumentStatus` has no backward transition, and a matched document must not silently return to NEEDS_CORRECTION. A correction after a decision returns 409.
26. **`next start` browser check:** run by a throwaway script in the session scratchpad, against a temporary user in the fixture organization, cleaned up after. It is not in the repo. Add Playwright only if you want it in CI.

27. **`score` is rounded to 2 decimals, then classified,** so the number shown always agrees with the status. A raw 89.995 shows as 90.00 and is `FULL_MATCH`.
28. **A missing bank field on the invoice or in master data is `VETO_BANK_MISMATCH`.** The rule says "≠ master", and an unknown account must never pass.
29. **Only `APPROVED`, `PAID` veto as duplicates; `PENDING_REVIEW` warns.** A veto-`REJECTED` invoice also sits at `PENDING_REVIEW`, so its twin gets the warning. It is display-only.
30. **A `REJECTED` result still returns `poId`** when the PO is found, so the review panel can compare. Score and breakdown stay null.
31. **One PO line can match one invoice line only,** so a repeated invoice line cannot score twice.

32. **The pending-duplicate warning is computed when `/matches` loads,** not stored, so it clears as soon as the twin is decided. `matches` has no column for it, and `match_completed` audits the value at match time.
33. **`/matches` hides imported history** and shows `-` under Review for `REJECTED`, which has no review path. Its links go to `/documents/[id]` until the Phase 5 review panel exists.
34. **`matchDocument` pages through vendors, POs and history,** because PostgREST caps a response at 1000 rows and a short read could silently miss a duplicate.

## Session C

**Accepted for the MVP, recorded here:**
- **Line-item correction is deferred** to the roadmap. Scalar fields stay editable; a misread line means uploading again (see Decision 24).
- **The 4 MB upload limit is accepted** for the MVP. Roadmap: direct-to-Storage upload from the browser.

**Decisions I took (phase 5 prep):**

35. **Rematch recovers a failure only.** D18.5 says no re-run button, so `POST /api/documents/[id]/rematch` runs matching only for an EXTRACTED document with no match, or one marked `MATCHING_FAILED`. Anything else returns `{ rematched: false }` and writes nothing. Re-evaluation after a vendor is verified is still "upload again".
36. **History rows are keyed on vendor + normalized number + invoice date.** The fixture's two duplicates (H-V001-001, H-V004-001) differ only in date, so all 138 rows import, and a re-import adds nothing.
37. **History matches carry `status = FULL_MATCH`, `score = null`.** `status` is required, and the rows were paid. `paid_marked_by` stays null: nobody here marked them.
38. **Import Histori sits on the Purchase Order page,** beside Import PO, admin only.
39. **The e2e run needs users, and they are permanent:** `e2e-<role>-<org>@finrecon.test`, in the target organization. A user with audit rows cannot be deleted (D21). The four `e2e-…`/`fx-…` users from Session B are still in the fixture organization for the same reason: the old script's `deleteUser` failed without saying so. One `review-approver-…` auth user from a test run this session stays for the same reason; `tests/helpers/fixture-org.ts` now has a permanent user for that case.
40. **`tests/e2e/fixtures.spec.ts` merges both of last night's scripts** (`e2e.mjs`: viewer, hover, correction; `fixtures.mjs`: fixture outcomes, duplicates). It uses the installed Chrome, not a downloaded browser.
41. **Demo Corp, one e2e run:** fixture 06 was uploaded, flagged, then removed. Its audit rows stay (append-only), along with two users: `E2E admin` and `E2E ap_staff`. The history import was run by `E2E admin`: I did not use or reset the demo users' passwords.

**"The destination stream closed early" is not ours.** The message is React's own (`react-dom-server`), raised when the socket closes during a server render. I reproduced it with the same digest, `2023578098`, by aborting requests to `/audit-log` mid-render with a plain `fetch`. In the e2e run, a test navigated away while `router.refresh()` from the previous step was still rendering. Nothing is lost: it is the client leaving. Nothing changed.

**Decisions I took (Phase 5):**

42. **Approve is refused (409) when a twin is already APPROVED or PAID.** This one is beyond the spec. D18.3 only vetoes at matching time, so two pending twins could both be approved once the warning cleared: a double payment. `validateDecision` applies the duplicate veto's own condition at decision time. Reject stays available.
43. **A decision is refused (409) while a document is marked `MATCHING_FAILED`.** A failed re-match leaves the old match row, which may not describe the corrected invoice. `/matches` shows the rerun button in its place.
44. **The rows of 9.2 add up.** D6 has no "no anomaly" qualifier on the high-amount row, and the product doc does, so the decision log wins: a high-amount `FULL_MATCH` with an anomaly needs the 5 evidence ticks, the anomaly tick and the reason. Fixture 06 is this case (Rp 133,2 jt).
45. **An anomaly adds its own tick item,** so a perfect `FULL_MATCH` with an anomaly still has something to tick.
46. **An unknown total counts as high.** An unverified line item is a required tick too, though line items cannot be corrected.
47. **The explanation is dropped if it quotes a number we did not give it** (`quotesOnlyInput`), and after 15 seconds. The check is coarse: a number only has to appear inside a given number. The anomaly reason is passed as one comparison row, or the text could call a flagged invoice clean.
48. **A re-match clears `explanation`,** so old text never sits beside a new result.
49. **`POST review` opens a session if none is open,** so every decision leaves a `review_sessions` row. A decision made straight through the API shows up as one with almost no time spent.
50. **`fields_corrected_count`** counts this reviewer's `field_corrected` audit rows since `opened_at`.
51. **The panel does not edit fields.** It links to the document page, so corrections have one home.
52. **No migration in Phase 5.** A partial unique index would make `POST session` strictly idempotent; two simultaneous requests can open two rows today. Marked `ponytail:`.
53. **Review writes are not one transaction,** like every route so far: match, then session, then audit. A conditional update stops double decisions, but a failure between the writes leaves a decision without its audit row, and the route returns 500. Marked `ponytail:`.
54. **Audit date filters use WIB.** Invalid filter values are ignored. The CSV export escapes formulas, because audit values can quote a vendor's document.

**Open questions for you:**

- ~~Correction can clear a veto.~~ Resolved by D25: 409 `VETO_LOCKED`.
- **A pending match is not rechecked at approval, apart from duplicates.** A vendor suspended, or a bank account changed, after matching still approves. D18.5 says re-evaluation means uploading again, so nothing changed.

**Decisions I took (Phase 7):**

55. **Resend is called with `fetch`,** not the SDK, for one plain-text POST. It has only been tested with a mocked `fetch`, because `EMAIL_MODE` stays `dry_run`. `docs/llm-context` has no Resend page, so the request shape is from memory: check it before the first real send.
56. **The send route claims the row first** (`DRAFT → SENT`, conditional), then sends, so a double click cannot send twice. A failed send puts it back to `DRAFT`, the one backward step, because nothing was sent.
57. **Not eligible returns 409, no contact returns 422,** an agent failure returns 502. No row is written unless `save_draft` ran.
58. **An open draft is returned instead of calling the model again.** One draft per match at a time.
59. **`get_followup_context` gives the invoice's bank details, not master's,** so a draft cannot leak the account on file to whoever reads it.
60. **`propose_po_number` also checks the number is in the reply,** beyond the spec's "exists, same vendor". A model cannot invent a valid-looking PO.
61. **Accepting a PO sends `acceptedReplyId` to the correction route,** which re-checks the proposal and adds a `po_proposal_accepted` audit row, as product doc 13 requires. D25 applies: a veto hides Terima, and the accepted number is usually not in the PDF, so it becomes a required tick.
62. **A long number in a reply warns even if it is a phone number.** The spec says any 8–20 digit sequence, and a warning only costs a look. Dots do not group digits, or `15.750.000` would warn; ISO dates are skipped; the vendor's own account and NPWP do not count.
63. **The reply wrapper replaces `<` and `>` in the vendor's text,** so a reply cannot close `</vendor_reply>`.

## Review: lib/agent/tools.ts and the send route (replaces STOP after Phase 7)

**Read, in this order:**

1. `lib/agent/tools.ts`, all of it. Short on purpose.
2. `lib/server/followups.ts`: `sendFollowup`, then `addReply`.
3. `app/api/followups/[id]/send/route.ts`: it takes no body, and passes only the id.

**Why it is safe:**

| Claim | Where it holds | Proved by |
|---|---|---|
| The agent cannot send email | No send tool. `lib/agent` cannot import `lib/email`, and only `lib/server/followups.ts` does | `tests/zones.test.ts`, "has exactly these tools", "saves a draft, stops after save_draft, and sends nothing" |
| The agent cannot change vendor, bank, invoice, match or status | Its tools are one read, one draft callback, and two that only fill an in-memory findings object. `lib/agent` cannot import `lib/supabase/admin`, and its client is read-only in the database (D21) | "a bank change request is flagged, and changes nothing", "an injected reply changes nothing, even when the model obeys it" (whole rows compared before and after, scripted model calling `approve_invoice`, `update_vendor`, `send_email`) |
| Recipient is always master data | `sendFollowup` reads `vendors.contact_email` at send time. The route takes no body, PATCH is a strict schema, and the model never sees an address | "sends to the master contact, whatever the invoice or the draft says", "re-reads the address at send time", "refuses any other field, the recipient above all", "never sees a contact address" |
| The model cannot reach another record | No tool takes an id. `matchId` and `organizationId` are bound by the server, and reads use the user client under RLS | "never sees a contact address, and no tool takes an id", "cannot read another organization, even with the right match id" (a real org B sign-in) |
| It cannot run away | `MAX_AGENT_ITERATIONS` = 6, and the draft loop stops after `save_draft` | "the iteration cap stops a model that keeps calling tools" |
| An email goes out once, only by a person | Conditional claim on `DRAFT` | "cannot send twice", "a concurrent double click sends once" |
| An LLM failure changes nothing | Reply detection is deterministic and runs first | "an LLM failure blocks nothing and writes nothing", "keeps the rule-based warning when the model is down" |

These tests are in `tests/agent/followups.integration.test.ts`. They use the real tools, loop, routes and database, with a scripted model. Live DeepSeek runs are in the e2e, in the fixture organization.

**What is not proved:** that the model writes a good email, or resists a prompt injection. Safety here does not depend on that: the test scripts the model to obey the injection, and nothing changes. A bad draft is caught by the person who reads it before clicking Kirim.

## Doc conflicts found (nothing changed)

- D18.5 says "no re-run button". You asked for rematch, so it recovers failures only (Decision 35). The log still says what it said.
- D6 and product doc 9.2 differ on the high-amount row (Decision 44).

- D10 still says "Loop: Anthropic SDK tool use, own loop in lib/agent/". D19 refines this to `runToolLoop`; CLAUDE.md, product-doc and dev-guide already say so. The D10 line was left as written because the decision log is a record.

## Review: lib/extraction-checks (replaces STOP 1)

**Read line by line:** `lib/extraction-checks/normalize.ts`, `signals.ts`, `verify.ts`, `locate-evidence.ts`, `index.ts`, `config.ts`.

**Tests:** `tests/extraction-checks/normalize.test.ts`, `signals.test.ts`, `locate-evidence.test.ts`, `verify.test.ts`, `generated-documents.test.ts`. All required cases are covered: "15.750.000,00", "15,750,000.00", "Rp15.750.000", "15.750" = 15750, Indonesian month names, dd/mm, value present vs absent, O-vs-0 invoice number, non-PKP arithmetic, ±Rp 1 boundary, line arithmetic.

**Written test-first; the tests found three real bugs on the way:**
- A truncated account was grounded: `12345678` matched `1234-5678 90`. `groundedDigits` now refuses a number that continues after a single separator.
- A correct date was not grounded on the `banner` layout: `PO-2026-004  TANGGAL  2026-07-21` read as "04 TANGGAL 2026" and swallowed the real date's year. Date patterns are now scanned separately, with a regression test.
- pdf.js in this version has no `destroy()`; the call was removed.

`generated-documents.test.ts` runs each generated PDF through the real router and the checks, with ground truth standing in for the LLM, so every format is exercised on real documents at no API cost.

**Output:** `npm test` at the end of the run: 17 files, 264 tests passed. These run only on synthetic documents, and never with real LLM output.

## Review: lib/matching tests (replaces STOP 2)

Written before any implementation, per the dev guide. They use literal numbers, not config constants, so changing a value in `lib/matching/config.ts` fails a test.

| File | Covers |
|---|---|
| `tests/matching/similarity.test.ts` | Jaro-Winkler reference values, identical = 1, empty = 0, symmetry, prefix cap |
| `tests/matching/normalize.test.ts` | Account, name, NPWP, invoice number, PO number |
| `tests/matching/bank-names.test.ts` | Every alias, unknown banks, missing names |
| `tests/matching/veto.test.ts` | Vendor identification (NPWP first, name ≥ 0.95, tie = not found); one test per `VetoCode`; no veto; duplicate only against APPROVED/PAID; pending twin warns; veto order |
| `tests/matching/scoring.test.ts` | Weights = 100; each component at its boundaries (0.5% → 25, 3% → 11.11, 5% → 0); partial lines; ±Rp 1 tax; non-PKP; no lines; PO of another vendor |
| `tests/matching/classify.test.ts` | 90, 89.99, 60, 59.99; PO not found → NO_MATCH at any score |
| `tests/matching/anomaly.test.ts` | ≥ 6 PAID in 24 months; 3× boundary; < 6 uses Rp 500 jt; history window with injected time; only PAID, only this vendor |
| `tests/matching/index.test.ts` | End to end, fixed order, worked example = 66.11, REJECTED never flagged |
| `tests/matching/fixture-sanity.test.ts` | Every fixture's documented outcome, duplicate on re-upload, fixture 04 after correction, D13 |

**Run output, before implementation:** 8 of 9 files fail. Seven fail at import because the modules do not exist, and 4 tests in `normalize.test.ts` fail because the functions do not exist. `bank-names.test.ts` passes, because you approved that normalizer first, and so does the invoice-number test, because the function already existed.

Independent check, outside the code under test: fixture 09's closest master vendor is V001 at 0.9398, below 0.95. D13's old figure of 0.9655 was for the old name.
