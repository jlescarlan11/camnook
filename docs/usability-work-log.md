# CamNook continuous usability work log

## Session state — 2026-09-12

- Continuation workspace: `/Users/johnlesterescarlan/Documents/CamNook-usability`, branch `codex/usability-followup`, based on `9eb35cd`. The shared checkout was externally committed to `codex/ship-ui-redesign-and-usability` during this task; future edits are isolated here to avoid interfering with release work. No deployment performed by this task; external release status unverified.
- Objective: explore real flows in Chrome; fix and verify one observed issue at a time until “stop and finalize.”
- Baseline: extensive uncommitted redesign changes and `design-qa.md` existed before this session. Preserve them; do not claim them as this session's fixes.
- Environment: Production catalog at https://camnook.shop shows the older interface. Isolated local CamNook on port 3003; port 3101 belongs to another project.
- Deployment: none performed or authorized by this session. Release path is protected-main CI → Development verification → protected Production approval → exact-SHA candidate/schema gates/promotion/public smoke.

## Final state — stopped at user request

- User requested stop and finalize. Exploration and implementation stopped after U40. No further issue selected.
- Final checkpoint: 742 tests passed / 2 existing provider checks skipped; full lint, TypeScript, diff check and production build passed.
- Task-owned local app (3003), fixture server (3002), and isolated Docker database stopped. Test containers/image retained for review; unrelated services untouched.
- Follow-up 2026-09-13: user authorized committing all task changes and creating a PR. Preparing the isolated follow-up branch against current main; no deployment authorized. U1–U6 were already included in merged PR #138, so this PR contains U7–U40 and the complete verification history.
- Tests used maxWorkers=2 to avoid machine-contention timeouts seen with default parallelism.
- Database checkpoint: all 75 migrations applied to an isolated Docker database; SQL suites 001, 012 and new 023 passed. Suite 001 required a transaction-local Storage fixture-deletion setting for the newer local Storage schema. Hosted data untouched.
- Local database: task-owned `camnook-usability-db-full` stopped (configured without network or published ports); initial `camnook-usability-db` stopped; local checkpoint image `camnook-usability-test-db:checkpoint`. Bootstrap uses official Postgres/Storage plus compatible Auth 2.189 migrations after newer Auth binary failed. Standard CLI local startup failed; hosted advisors cannot assess this unshipped migration. SQL permission checks passed; no hosted advisor claim.
- Deployment remains unperformed. New U36 migration must accompany a future authorized release. U7 onward remain isolated from external release commit `9eb35cd`.

## Verified fixes

- U1–U40: evidence, changes and per-fix checks are preserved in [verified fix history](usability-verified-fixes.md). These are local verification records; they do not imply deployment.

## Unresolved issues / blockers

- One Production camera-step navigation kept previous content until refresh; not reliably reproduced or fixed.

- Report narrow-screen check remains unverified: viewport override did not apply to its tab; override reset. Desktop report rendering and filter recovery were verified.

- Intermittent Production camera/account/booking load failures recovered on retry. A read-only Vercel Production error-log query for the recent two hours returned no records; root cause remains unproven. No backend or deployment changes made on that evidence.

- Development catalog loads, but Canon R50 scheduling is disabled; full hosted schedule verification is blocked. No hosted policy changes made.
- Supabase connector denied publishable-key read; existing authorized Vercel Preview env pull restored local setup. `.env.local` retains only public app config and was checked against Development. No secrets in this log.
- Production Chrome has an existing signed-in session; request page can be inspected. No private profile values are recorded in this log. Local Development session remains separate.

## Harness

- `node scripts/usability/serve.mjs` serves the real component at http://127.0.0.1:3002 with synthetic quote responses and no hosted data writes.
- In the Chrome skill runtime, import `scripts/usability/check-schedule.mjs`; pass the harness tab and future pickup/return labels observed in its calendar to `checkScheduleReselection`.
- App dev server: http://localhost:3003 (isolated Development). Existing unrelated service on 3101 is untouched.

- Address recovery fixture: `/address-recovery`; Simulate next area lookup failure resets the synthetic one-time failure. Select Region VII, then Retry area lookup. Verify region and unfinished note remain and province choices appear.

- Request fixture: `/request-submission`; fill synthetic details, Continue to review must leave Submitted form fields at Not submitted. Request rental displays the payload without sending any hosted request.

- Map search fixture: `/map-search`; search Cebu fixture, then Unavailable fixture. Failed query must show no earlier address choices.

- Sign-in recovery fixture: `/login-recovery`, renter@example.test only, synthetic failure/no email. Verify visually that the email remains and retry works. Browser text snapshots redact email values.

- Owner navigation fixture: `/owner-overview`; one synthetic booking-review item and eight empty stages. Only the populated stage links, directly to `/admin/bookings#queue-review`.

- Owner passed-pickup fixture: `/owner-past-pickup`; real readiness calculation/panel with synthetic history, no decision action.

- Camera fixture: `/camera-edit`; synthetic kit has two batteries and a comma-containing item name. Change Daily price and Save camera; inspect submitted quantities without hosted writes.

- Availability recovery fixture: `/handoff-recovery`; choose Tuesday, change enabled setting, enter invalid time, then correct to 17:00. Verify other changes persist.

- Blocked-date fixture: `/blocked-dates`; invalid reversed range must preserve both inputs, then corrected success clears them. No hosted block is created.

- Booking-load fixture: `/bookings-load-recovery`; Retry bookings must open `/admin/bookings` with the synthetic review queue.

- Cancellation fixture: `/cancellation-recovery`; temporary synthetic failure must retain the reason through retry.

- Fractional-price check: root harness → Use fractional prices → select one-day range and time. Expect ₱450.50 rental, ₱1,000.25 deposit, ₱1,450.75 total. Reload restores regular synthetic prices.

- Photo fixture: `/photo-recovery`; import `check-photo-recovery.mjs` in the Chrome skill and run `checkPhotoRecovery(tab, absoluteTestPhotoPath)` with `scripts/usability/test-photo.png`. Fresh page required; first synthetic upload fails, second succeeds.

- Camera-load fixture: `/camera-load-recovery`; retry opens the synthetic camera with original schedule and fresh quote.

- Booking-back fixture: `/booking-back-navigation`; actual detail-page link must open `/admin/bookings` and its review queue.

- Unpublish fixture: `/unpublish-recovery`; first synthetic attempt fails visibly, retry confirms success without hosted writes.

- Report fixture: `/report-period`; submit reversed start/end, verify values retained, correct one endpoint and apply again. Uses synthetic zero-valued report data only.

- OTP fixture: `/otp-recovery`; dummy six-digit value only. Synthetic verification fails; verify retention visually because browser text reads redact code inputs. No code is checked or emailed.

- Photo gallery fixture: `/photo-gallery`; expand View all 3 photos, verify all three loaded and uncropped, Enter collapses. Uses synthetic SVGs through the actual Next Image component.

- Payment proof fixture: `/payment-proof`; generated image only. Run `checkPaymentProofRecovery` from `scripts/usability/check-payment-proof-recovery.mjs` with the tab and generated test-photo.png path.

- Initial payment fixture: `/payment-submission`; `checkPaymentSubmissionRecovery` verifies rejected TEST1234 → corrected TEST5678 with proof chosen once. No hosted submission.

- PR preparation: rebased the follow-up onto main after PR #139. Push verification passed 742 tests and required updating the launch-evidence repository migration count from 74 to 75. Historical hosted observations and NO_GO remain unchanged.
