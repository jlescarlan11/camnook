# Address location implementation verification

Date: 2026-09-26. Branch: `codex/address-location`, original base `922738e`.
The initial implementation checks below predate integration. At the user's
request, the branch was subsequently rebased onto main `7cb960a` for a PR and
merge. Hosted migrations and promotion must use the existing release workflow.

## Integration follow-up

- Preserved main's indeterminate-save recovery, request deduplication, map
  cancellation, collapsible pin editor, and automatic SQL-test discovery.
- Updated feature tests to reopen the editor before reconfirming a pin.
- Reproduced and fixed a restored GPS draft being hidden by a saved pin's
  collapsed editor. Unconfirmed changed drafts remain visible until confirmed
  or cancelled; confirmed pins still collapse.
- Repository migration inventory is now 96; historical Production evidence is
  unchanged.
- Ran the requested global `npm i -g vercel@latest`; verified Vercel CLI
  **60.1.3** (previous installed version: 59.23.2). The release workflow's pinned
  toolchain was not changed.

## Delivered behavior

- Checkout and account address forms offer the five requested region groups.
- Explicit device permission and one bounded Geoapify POST suggest current PSGC
  areas. Missing/ambiguous barangays stay manual; typed premises and postal data
  are preserved.
- Original GPS coordinates stage a draft pin. Confirmation is explicit and
  invalidated by subsequent address/pin changes, including draft restoration.
- Versioned reference reads, release validation, stale-request cancellation,
  canonical Cebu aliases, Manila districts, and official new-region fallback.
- Additive authenticated catalogue RPC, rollback-only hosted smoke, operational
  guidance, and privacy wording. No new dependency or rollout flag.

## Checks

- Focused UI/location checks after review fixes: 86 passed, one opt-in provider
  check skipped. Review fixes were reproduced with failing tests before fixing.
- Final full suite after review fixes: 944 passed, three opt-in checks skipped
  (129 passing test files). Full lint and typecheck also passed on the final code.
- Final production build passed after review fixes. Builds use synthetic local
  public Supabase configuration, no production key.
- Real disposable PostgreSQL: new reference test, existing PSGC (019), structured
  address/pin (022/026), hosted smoke in two repeatable passes, and concurrency
  harness passed. No user data retained by hosted smoke fixtures.
- PSGC validation: 43,766 rows; 18 regions. Hosted manifest validation passed.
- Launch-evidence validation passed after migration inventory became 79. The
  historical NO_GO evidence was preserved; this does not certify a current
  production release.
- Development Geoapify samples: UP Cebu → Cebu City / Central Visayas; Rizal
  Park → Manila / Metro Manila. Neither supplied a barangay hint. Partial results
  therefore require manual barangay selection. This is not nationwide coverage
  certification.
- Chrome extension on verified Default / John lester profile: synthetic complete
  and partial autofill, denied permission, provider failure, preserved text,
  confirm→edit, reload restoration, and 390px layout checked. No actual device
  location or renter saves. Temporary fixture removed before the build.

## Independent review

One read-only independent review of `922738e..77b81e8` found two Important issues:

1. Unknown-region fallback could apply GPS to invisible state. Regression now
   verifies visible official region/city changes before pin acknowledgment. The
   fallback now renders the same controlled canonical state.
2. A new GPS attempt did not invalidate an older result awaiting lazy barangay
   validation. A deferred-result regression now proves it cannot apply after a
   newer failed attempt. Invalidation starts at the user's action.

Both regressions were RED→GREEN. The related lower-map interlock was also tested
RED→GREEN: a pin-only GPS attempt announces its start and cannot overwrite a
newer address-location action. There were no Critical or deferred Minor findings.

## Rulings and limitations

1. Preserve unrelated checkout work in an isolated worktree; no merge/push or
   promotion without release scope. Cost: integration is a separate user choice.
2. Keep shopping state separate from existing default official consumers.
   Cost: an additional component to maintain. The shopping component's own
   official fallback shares its canonical state, avoiding two state owners.
3. Use pure selection preparation plus component-owned async state, rather than
   the proposed reducer. Cost: synchronization remains component code; controlled
   response/race tests cover its cross-boundary behavior.
4. Add existing regression 026 to the explicit harness and schema-qualify its
   private constraint names after reproducing its search-path failure. Cost:
   test-only changes; no production constraint changes.
5. Local Supabase containers were not running. Type generation reported
   `supabase start is not running`; the JSON-returning RPC declaration was added
   from the SQL signature and checked with TypeScript and real PostgreSQL.
   Cost: full generator regeneration remains a release/local-stack check.
6. The reviewer set aside production deployment, nationwide provider coverage,
   and pre-existing lower-map cancellation. No deployment is authorized and two
   public samples cannot establish nationwide coverage. The new upper/lower
   location interaction was brought into scope and protected with a regression;
   broader unchanged map-only behavior was not rewritten. Cost: authenticated
   live checkout, configured tiles, and broader provider coverage remain release
   verification, not claims of this local implementation.

Early parallel test runs hit existing 5-second timeouts under concurrent host
jobs. Final suite runs use one worker and a 30-second command-line timeout;
repository test settings are unchanged.

Before shipping: regenerate types with the local Supabase stack, apply the
additive migration through the verified release workflow, admit the exact SHA,
and verify authenticated checkout/account and tiles after promotion. The
global Vercel CLI update is complete; production retains its reviewed workflow
toolchain.
