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
