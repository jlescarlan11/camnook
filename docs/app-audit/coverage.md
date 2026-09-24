# Coverage

| Journey / state | Current evidence | Remaining |
| --- | --- | --- |
| Guest catalog, desktop, failed request | Error and retry control observed; `01-catalog-error.png`; no console errors | Retry after transient failure under controlled conditions |
| Guest catalog, desktop, success | Fresh reload shows two Development listings after DNS recovered | Screenshot, detail dialog, mobile, keyboard |
| Schedule → quote → checkout | Canon R50 Sept 26–28 selected; sole 09:00 time; PHP 900 rental + 1,000 deposit = 1,900 total. Synthetic renter selected meetup, reviewed, survived injected auth outage, and submitted successfully | Invalid dates, change-date round trip, unavailable camera |
| Sign-in and renter profile | CAPTCHA failure/retry verified with real widget; 390×844 screenshot, no horizontal overflow; desktop Lighthouse 30 checks passed. Supported synthetic renter refreshed and authenticated | Successful real CAPTCHA/OTP unverified; renter profile browser persistence |
| Rental lifecycle | Real synthetic request saved; owner-review status, schedule and meetup persisted after reload and page-error retry | Owner response, agreement/payment/handoff/return and exceptions |
| Owner inventory/settings/reports | Routes and prior fixes inspected | Current browser verification |

Screenshots alone do not prove accessibility compliance. Synthetic or simulated checks will be explicitly distinguished from real Development integration.

- AUD-004: booking desktop1440/mobile390 Lighthouse33 checks passed, zero failed; account desktop42 passed, mobile one unrelated attribution-link finding. Privacy mobile27 passed. Screenshot09–12. Account mobile overflow discovered (AUD-005), so responsive account coverage is not passing.

- AUD-005: actual account page now fits320px and390px, including profile form; desktop1440 two-column layout preserved. Screenshots13–15.

- AUD-006: real account map attribution visibly underlined; mobile Lighthouse42 checks passed, zero failed. Screenshot16.

- Renter lifecycle: empty cancellation reason blocked with focus; valid synthetic cancellation saved, persisted after reload, and removed repeat request form. No owner decision yet. Renter /admin redirects to Access denied.
- Account profile: missing required pin produces actionable validation while preserving fields. Structured synthetic address and confirmed public-location test pin saved via UI and persisted on reload. No real residential data used.

- AUD-007: camera/profile navigation and refresh preserve rental plans; same schedule retry identity retained. Real Development committed-response-loss → alternate date draft → original date exact-payload retry recovered the same booking, no duplicate. Successful draft cleanup verified. New booking3f7bdcc3-357b-4b0b-a048-a194694411e2; account total3. Screenshot18–19.
- Catalog details tooltip and schedule calendar dismiss with Escape and return focus to trigger; mobile390 fits. Old dates disabled; selected dates return through Change dates.
- Profile stale-edit path remains unverified (ENV-003). Current persisted synthetic house Audit13 and pin remain intact.

- Camera lightbox: mobile390 screenshot inspected; keyboard arrow wrap, Escape dismissal and focus restoration verified; open-dialog Lighthouse20 passed, zero failed. Native dialog confines page focus (browser chrome remains reachable).
- Missing camera and synthetic nonexistent booking both show specific not-found screens; recovery links return to catalog/account successfully.
- AUD-007 post-success fresh checkout confirmed blank purpose/city/meetup and a new operation identity.

- Unrequestable Development camera shows explicit unavailable state and Browse cameras, with no schedule controls.
- Real renter sign-out redirects to sign-in; other-tab owned booking navigation and browser Back to account require authentication. Supported synthetic session restored afterward.
- AUD-008: one-time checkout read503 then UI Retry restores same schedule and address-edit step; fresh server estimate required. Mobile390 screenshot20 inspected.

- Account read failure: injected one Development overview503; existing Try again link fetched successful profile/bookings without navigation away. No defect found. Fault harness stopped.

- AUD-009: account privacy link opens separate notice tab and preserves unfinished fields plus pin-reconfirmation state. Screenshot21 mobile390 inspected; shared checkout link changed, but that variant was not separately browser-exercised in this final checkpoint.

- AUD-010: live camera-detail gallery inspected at desktop and 390×844. Thumbnails are announced as buttons that enlarge a photo, not checkbox-like selection toggles. The second photo opened in the lightbox; Escape closed it and returned focus to that trigger. Visual selected styling and layout were preserved.

- AUD-011: a real Development provider DNS failure reached the page retry state, then the next protected request incorrectly redirected to sign-in. Focused proxy coverage now distinguishes transient claims failures from absent sessions. The later unchanged full suite passed with 856 passed / 2 skipped; a post-fix browser session could not be established because automated CAPTCHA/OTP remains unavailable.

- AUD-012: live desktop inspection first found the primary 676px camera photo at `loading="auto"`, with no image preload link and a Next LCP warning. Focused render coverage now asserts eager loading for that initial photo; thumbnails stay lazy. A transient Development provider failure prevented a post-fix browser render, but the focused gallery suite plus the full suite (856 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-013: a client interaction reproduction of a server validation return now verifies invalid state and alert association for Name; the same relationship covers phone, meetup choice, purpose, and shooting city. Details-step focus recovery and form values remain verified. Focused request-form suites, the full suite (856 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-014: checkout KYC's server-returned phone validation path now verifies the mobile control's invalid state and association with its visible error while retaining country-code context. Standard personal/address controls use the same wrapper. Focused KYC suites, the full suite (856 passed / 2 skipped), lint, typecheck, and build pass. PSGC and residential-pin error associations remain untested specialized controls.

- AUD-015: checkout KYC's server-returned Philippine area validation now marks the semantic selector group invalid and associates it with the visible error without replacing its status description. Focused checkout flow, the full suite (857 passed / 2 skipped), lint, typecheck, and build pass. Residential-pin error association remains untested.

- AUD-016: residential pin server and reconfirmation alerts are associated with its labelled composite region. Focused residential-pin/checkout suites, the full suite (858 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-017: mocked renter payment validation now verifies invalid state and individual error associations for GCash reference and private proof, preserving proof guidance. Focused payment suites, the full suite (859 passed / 2 skipped), lint, typecheck, and build pass. No real payment or proof upload was attempted.

- AUD-018: full source-only security scan completed with separate architecture and baseline review receipts. No source-supported reportable finding across authentication, authorization, KYC/payment/evidence privacy, upload integrity, webhooks, cron/management routes, provider boundaries, and rental lifecycle integrity. Deployed-state verification remains outside this static checkpoint.

- AUD-019: public camera-date picker uses button semantics both before and after selecting a pickup date. The live AX tree retains the explicit selected-pickup label while no longer exposing a checkbox/toggle state. Focused calendar tests, full suite (860 passed / 2 skipped), lint, typecheck, and build pass.

- AUD-020: mocked owner payment-decision responses now mark amount, reference, actual-account confirmation, and rejection reason invalid and associate each with its current alert. Both interaction paths, full suite (862 passed / 2 skipped), lint, typecheck, and build pass. Owner browser verification remains unavailable without a known Development owner session; no payment operation was performed.

- AUD-021: mocked owner GCash-configuration validation now marks recipient name and GCash number invalid and associates each with its current alert while retaining the mobile control's country-code description. Focused test, full suite (863 passed / 2 skipped), lint, typecheck, and build pass. Owner browser verification remains unavailable without a known Development owner session; no configuration was changed.
