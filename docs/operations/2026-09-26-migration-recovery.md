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
The repository now contains 94 migrations. Application to hosted environments
and exact-revision promotion must run through `.github/workflows/release.yml`.
