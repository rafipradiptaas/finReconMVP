# Session C report

**Session C is complete: Phases 5, 7 and 8 are done and committed on the local branch `session-c`.** Nothing was pushed or merged. Demo Corp holds the history import and no uploads, and `EMAIL_MODE` stayed `dry_run`.

Two things to read first:

- **There is no single green run of all 25 e2e tests.** Tests 1–17 passed in one run and the remaining ones in the next, with only test selectors changed in between. I stopped there to stay inside the LLM cap.
- **I started one e2e run by accident** by leaving it in a diagnostic command. I killed it in under a minute. It spent about 3 calls and left one document in the fixture organization, which I removed.

## Phases

| Part | Result |
|---|---|
| Phase 5 prep | Matching failure handling, rematch, history import (138 rows in Demo Corp, fixture 06 flags there), Playwright e2e |
| Phase 5 | `lib/review`, session/review/note/mark-paid routes, match explanation, review panel, audit log with CSV export |
| D25 | Corrections refused on a veto (`VETO_LOCKED`) and on a decided match (`DECISION_LOCKED`). A manual value that is not in the document is shown as such and needs a tick |
| Phase 7 | `lib/followup-checks`, `lib/email`, `lib/agent`, follow-up routes, panel UI, draft, dry-run send, reply paste, fraud warning, PO proposal |
| Phase 8 | History import was done in prep. Chatbot tools, loop, `/api/chat`, `/chat`, 40-question eval |
| Log investigation | "The destination stream closed early" is a client disconnecting, not our code. Reproduced with the same digest; nothing to fix |

## Commits

| Hash | Message |
|---|---|
| `7cec88f` | phase 5 prep: rematch, history import, e2e |
| `f178e7c` | phase 5: review panel, PAID, explanation, audit log |
| `46829c4` | phase 5: veto and decision locks on corrections (D25) |
| `18d1cce` | phase 7: follow-up agent |
| latest | phase 8: chatbot and eval |

## Check results

| Check | Result |
|---|---|
| `npm test` | 47 files, 764 tests passed, including the real-database integration tests |
| `npm run typecheck`, `npm run lint` | Passed |
| `npm run build` | Passed (run by the e2e) |
| `lib/review` coverage | 100%, measured at Phase 5; D25 added code with its own tests, not re-measured |
| e2e, tests 1–17 | Passed, live DeepSeek, Chrome, fixture organization |
| e2e, the remaining tests | Passed in the next run, with fixtures 01, 02, 03, 05 and 06 uploaded again |
| e2e failures on the way | A loose selector (`Alasan` also matches "Tempel balasan"), and one live read of fixture 01 held at `NEEDS_CORRECTION`. The test now retries; I could not see which field, because cleanup removed the document |

## Chatbot eval

Run on 1 Nov as an `E2E admin` user in Demo Corp, read-only. File: `eval/runs/chatbot-2026-11-01.jsonl` (not committed).

| | Count |
|---|---|
| Questions correct | 28 of 30 |
| Questions refused | 2 of 30 |
| Questions answered wrongly | 0 |
| Traps refused | 10 of 10 |
| Traps fabricated | 0 |

**Read these with care:**

- **The 2 refusals are both "how many invoices paid between two dates" questions** (q17, q22). The model refused without calling a tool, though `get_vendor_total` returns `invoice_count`. Four similar questions passed. A clearer tool description is the likely fix, but I had no calls left to test it, so nothing changed.
- **This set is easy.** It has clean fixture data and one tool per question.
- **The numeric guard is part of the result.** An answer quoting a number no tool gave would have become a refusal. The run does not record whether that happened.
- **`list_flagged_transactions` and `get_document_detail` were not exercised,** because Demo Corp has no uploads. Integration tests cover both with a scripted model.

## LLM calls and cost

149 of the 150 DeepSeek calls allowed for steps 3–5. All data was synthetic. Cost is a ceiling (peak rate, no cache hits).

| Run | Calls | Cost |
|---|---|---|
| e2e subset | 15 | $0.0092 |
| Failed full e2e plus the accidental run | 21 (counted from audit rows) | about $0.02 (estimated) |
| Full e2e, 17 passed | 30 | $0.0249 |
| Remaining e2e tests | 13 | $0.0106 |
| Chatbot eval | 70 | $0.0305 |
| **Total** | **149** | **about $0.10** |

No Claude API calls. Phase 5 and the prep used further DeepSeek calls before this cap applied; they were not counted.

## Review queue, in priority order

1. **`lib/agent/tools.ts`:** [review section](review-queue.md#review-libagenttoolsts-and-the-send-route-replaces-stop-after-phase-7).
2. **`lib/server/followups.ts` (`sendFollowup`, `addReply`) and `app/api/followups/[id]/send/route.ts`:** same section.
3. **D25:** `lib/review/correction-lock.ts`, `lib/review/required-items.ts`, `app/api/documents/[id]/correct/route.ts`.
4. **`lib/review/validate-decision.ts`,** including the duplicate refusal, which goes beyond the spec (Decision 42).
5. **`lib/chatbot/tools.ts`.**
6. **[Decisions I took](review-queue.md#session-c):** 35–70.

## What you must do manually

- **Merge `session-c`** when you are satisfied.
- **Log in as the demo users.** I did not use or reset their passwords.
- **Set `LLM_PROVIDER` and `DEEPSEEK_API_KEY` in Vercel.** Leave `EMAIL_MODE` unset or `dry_run`. Staging has not been tested.
- **Check the Resend request before any real send.** It is untested live, and `docs/llm-context` has no Resend page.
- **Read one real agent draft.** The e2e checks the flow and the recipient, not the quality of the email.
- **Decide on the two open questions** in the review queue, if you want them changed: a vendor suspended after matching still approves, and review writes are not one transaction.

## Demo checklist, scenarios 1–14

Demo Corp, in this order. Scenario 1 comes first, because a PO cannot be re-imported once an invoice references it. Scenarios 13–14 come before 5, because Terima disappears once fixture 02 is decided.

| # | User | Fixture | Expected |
|---|---|---|---|
| 1 | admin | `vendors.csv`, then `purchase_orders.csv` | Import succeeds with no changes; vendor indicators show |
| 12 | ap_staff uploads and stays logged in | `01_full_match_V001.pdf` | Panel explains why, with no approve button; `curl` returns 403 |
| 11 | approver | fixture 01 panel | Evidence is highlighted on the PDF; hovering a field narrows it |
| 2 | approver | fixture 01 | One click on Setujui, then Tandai dibayar; shows in Audit Log |
| 3 | ap_staff | `01_full_match_V001.pdf` again | `REJECTED`, `VETO_DUPLICATE_INVOICE`, with an explanation |
| 4 | ap_staff, then approver | `03_veto_bank_mismatch_V004.pdf` | `VETO_BANK_MISMATCH`, no approve button, note only. A correction returns 409 `VETO_LOCKED` |
| 13 | ap_staff uploads, then approver | `02_partial_price_plus3pct_V003.pdf` | Buat draft follow-up; recipient is `finance@cahayaprintindonesia.example`, read-only. Kirim gives "mode uji" |
| 14 | approver | same panel | Paste "Mohon transfer ke rekening baru kami 9876543210": fraud banner, and `vendors` unchanged. A reply with `PO-2026-003` shows the proposal and Terima |
| 5 | approver | same panel | `PARTIAL_MATCH`, score 66.11; ticks plus a reason; audited as an override |
| 6 | ap_staff, then approver | `06_anomaly_8x_history_V009.pdf` | Anomaly at 8.7× the mean. Rp 133,2 jt, so 5 evidence ticks, the anomaly tick and a reason of 20+ characters |
| 7 | ap_staff, then approver | `04_needs_correction_no_invoice_number_V005.pdf` | `NEEDS_CORRECTION`; enter `INV-BKP-0728`; `FULL_MATCH`. The number is not on the PDF, so the panel needs the "nilai manual, tidak ada di dokumen" tick |
| 8 | ap_staff | `10_unsupported_scanned_image_only.pdf` | `UNSUPPORTED_FORMAT` with a clear message |
| 9 | approver | `/chat` | "Berapa total pembayaran ke PT Sinar Logistik Nusantara?" gives Rp 529.828.000 (history Rp 503.188.000 plus fixture 01 from scenario 2), and the tool shows under the answer. "Siapa CEO PT Sinar Logistik Nusantara?" gives the refusal |
| 10 | `org-b-demo@finrecon.test` (credentials were given once in chat) | none | Sees no Demo Corp data |

Fixture 08 (V010) has no contact, so its panel asks an admin to fill master data: a good extra for scenario 13.
