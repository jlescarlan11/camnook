# Coverage

| Journey / state | Current evidence | Remaining |
| --- | --- | --- |
| Guest catalog, desktop, failed request | Error and retry control observed; `01-catalog-error.png`; no console errors | Retry after transient failure under controlled conditions |
| Guest catalog, desktop, success | Fresh reload shows two Development listings after DNS recovered | Screenshot, detail dialog, mobile, keyboard |
| Schedule → quote → checkout | Canon R50 Sept 26–28 selected; sole 09:00 time selected correctly; checkout auth redirect preserves schedule | Authenticated completion, invalid dates, back/refresh, unavailable camera |
| Sign-in and renter profile | CAPTCHA failure/retry verified with real widget; 390×844 screenshot, no horizontal overflow; desktop Lighthouse 30 checks passed. Supported synthetic renter refreshed and authenticated | Successful real CAPTCHA/OTP unverified; renter profile browser persistence |
| Rental lifecycle | Existing automated suites pass | Renter/owner browser coverage from request through completion and exceptions |
| Owner inventory/settings/reports | Routes and prior fixes inspected | Current browser verification |

Screenshots alone do not prove accessibility compliance. Synthetic or simulated checks will be explicitly distinguished from real Development integration.
