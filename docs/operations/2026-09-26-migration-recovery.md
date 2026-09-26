# Recover the missing Development migration

Release 36214709631 stopped before applying migrations because Development had
version `20260926025452` recorded without a corresponding repository file.

The read-only recovery workflow uses the existing protected Development
environment and pinned Supabase CLI 2.114.0. Run 36215418659 recovered
`20260926025452_normalize_kyc_profile_api_conflicts.sql` from migration history.
The downloaded artifact SHA-256 was
`f2cd99a9798a3f4cd6cdf6939fe39fe410b2dba9ee4ee4352a1bc167083439fc`.
The restored SQL retains its recorded version, name, statements, and grants;
only trailing blank lines emitted by migration fetch were removed.

The migration translates two named KYC business conflicts from SQLSTATE 40001
to P0001 at the API boundary, avoiding inappropriate transaction retries.
Other exceptions still propagate. It retains the private implementation,
authenticated-only execution, and empty search path. No customer data changes
or migration-history repairs were performed by recovery.

The application now recognizes both the old and normalized conflict responses.
Existing SQL assertions were aligned with the two exact API conflict messages.
While recovery was in progress, Development recorded another migration,
`20260926033850_normalize_contract_signing_api_conflicts.sql`. Read-only recovery
run 36215743520 retrieved it with artifact SHA-256
`3d3aca40b91debb5d366606ce5ab33a0528c5df6d23b6e414f7ec9f3777213fa`.
It similarly translates three named signing conflicts to P0001 while preserving
the invoker security model and all other errors. Its SQL was restored with only
trailing blank lines removed, and the signing action and existing SQL assertions
were aligned with the normalized responses.

The historical launch-evidence file's repository inventory count was updated;
its historical Production observations and NO_GO decision were not changed.
The repository now contains 95 migrations. Application to hosted environments
and exact-revision promotion must run through `.github/workflows/release.yml`.
