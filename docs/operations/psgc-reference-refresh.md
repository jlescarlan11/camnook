# PSGC reference refresh

Use this runbook when the Philippine Statistics Authority publishes a new PSGC
quarter. A refresh is a reviewed data release, not an in-place edit.

## Prepare the source

1. Download the publication workbook from the official
   [PSGC page](https://psa.gov.ph/classification/psgc). Do not use an aggregator
   or copy a previous quarter's URL without verifying the publication date.
2. Compute the workbook SHA-256 and retain the untouched workbook outside the
   repository as release evidence.
3. Export a UTF-8 CSV with exactly these columns:
   `code,name,type,parent_code,city_class`. Keep ten-digit codes as text. Map
   locality classes to `CC`, `HUC`, or `ICC`; leave city class empty for every
   non-city row.
4. Add `data/psgc/<release>.manifest.json` with the source title, URL, workbook
   hash, effective date, normalized CSV hash, and counts. Never update the
   manifest hash merely to make a failing validation pass; reconcile the source
   and transformation first.

## Validate and generate

Run the deterministic validator before generating SQL:

```sh
pnpm psgc:validate data/psgc/<release>.manifest.json
```

The validator rejects duplicate or malformed codes, missing/invalid parents,
incorrect independent-city placement, unexpected city classes, count drift, and
normalized-file hash drift. Review a sample of regions, a component city, an HUC
or ICC, Pateros, a submunicipality, and barangays against the workbook.

Generate a new forward-only seed migration:

```sh
pnpm psgc:sql data/psgc/<release>.manifest.json \
  > supabase/migrations/<timestamp>_seed_psgc_<release>.sql
```

The generated migration inserts the release and rows, invokes database
validation, and activates the release in one transaction. Do not hand-edit the
generated SQL. If transformation rules need to change, update the source CSV or
generator, validate again, and regenerate.

## Verify and release

Replay the complete migration chain in a disposable database and run the
database tests. Verify the manifest counts, independent-city cascade, one
ordinary province/city/barangay cascade, resolution of the new path, and that a
deliberately incomplete test release cannot replace the active release. Run the
application typecheck, lint, unit/integration suite, and production build.

Publish the exact reviewed commit through CamNook's verified release path. After
promotion, confirm the location selector reports the new release and resolves a
representative path. Do not expose raw private anchors while collecting evidence.

## Corrections and rollback

Never rewrite a released code used by an anchor. Represent renamed, split,
merged, or retired areas with historical validity and
`private.psgc_supersessions`, then ship a corrected/new release. Existing anchors
remain traceable to their original release; the UI can mark them as needing
review rather than silently remapping them.

If validation or migration application fails, the transaction rolls back and
the previous active release remains authoritative. Stop promotion, preserve the
failure output without private coordinates or credentials, correct the source or
generator, and issue a new forward migration. If a valid but operationally bad
release reaches production, restore service with a reviewed forward migration
that activates the last valid release; do not edit production rows manually.
