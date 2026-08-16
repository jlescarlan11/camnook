# Owner Operations and Portfolio Reporting

Status: implementation validated and owner-approved for the MVP release on
2026-08-16. Production activation still follows the machine release gate.

## Operating surface

Only the sole database administrator can open `/admin` or execute
`api.get_owner_operations_dashboard()` and
`api.get_owner_portfolio_report(date, date)`. Anonymous and ordinary renter
calls are denied in PostgreSQL. Do not replace these reads with service-role
table queries or spreadsheet totals.

The operations response is one database snapshot with nine required queues and
counts derived from those exact arrays. If the projection or strict server DTO
fails, every operations section closes with an unavailable warning. Never
interpret the error state as zero work. Detailed actions remain in the audited
booking, payment, pickup, and cancellation routes. Online identity review is
retired.

Broad dashboard data intentionally excludes full GCash references and sender
details, camera serials, private paths/URLs/digests, government-ID type or
evidence metadata, free-form cancellation/internal notes, and acquisition data
outside the owner report.

## Period and financial semantics

The report form accepts Manila dates. The start date is included and the end
date is excluded. For example, `2026-11-09` through `2026-11-23` covers midnight
at the start of 9 November through—but not including—midnight at the start of
23 November in `Asia/Manila`. Invalid, equal, or reversed dates load no report.

- Rental revenue is incoming verified `rental_payment` allocations minus
  outgoing verified reversal allocations, recognized at the immutable payment
  decision time.
- Unverified transfers, security deposits, deposit refunds, deductions, and
  remaining liabilities are excluded.
- Every allocation must use its transaction's immutable booking and is
  attributed through that booking's camera. Camera
  period totals must equal the portfolio period total.
- A correction is a verified opposite transaction whose allocation set exactly
  matches the original; history is never edited.

Deposit reconciliation must satisfy both equations before acting:

```text
verified deposits - approved deductions - net external refunds
  = remaining liability

held liability + pending-refund liability
  = remaining liability
```

If either equation fails, the database projection raises and the dashboard
closes. Investigate immutable records; do not insert an offset merely to make a
screen balance.

## Utilization and recovery

Rental utilization uses scheduled `[pickup_at, return_at)` intervals for
`CONFIRMED`, `ACTIVE`, `RETURN_REVIEW`, `ISSUE_REVIEW`, and `COMPLETED` bookings.
Intervals are intersected with both the selected period and the camera's
creation-to-archive inventory window, then unioned per camera before duration,
so overlap cannot count twice. Maintenance and manual unavailability use the
same clipping rule, treat blocks released before they start as empty, remain
separate measures, and do not silently alter rental utilization.

Archived cameras remain in owner history. Draft and archived inventory remains
absent from public catalog projections. Null or zero acquisition cost is shown
as unavailable. Otherwise lifetime net verified rental revenue determines a
cost-capped recovered amount, nonnegative remaining amount, and 0–100% recovery
percentage. This is an operating metric, not an accounting/tax statement.

## Validation and recovery

The automatic rollout requires these checks before hosted migration:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The Development workflow binds its exact project ref, applies the forward
migration, runs hosted checks and advisors, and identifies the verified Git SHA.
After that automatic run succeeds for `main`, Production applies the same
revision while keeping runtime feature activation and deployment out of scope.

Rollback is forward-only: close the owner page or ship a reviewed corrective
migration. Never delete or rewrite payment transactions/allocations, deductions,
refund records, bookings/history, acquisition costs, handoffs, evidence, or
audit rows. Preserve the selected dates, observed mismatch, migration history,
and application revision for incident review without copying private values.
