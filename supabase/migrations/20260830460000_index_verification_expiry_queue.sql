-- Support the bounded historical verification expiry queue without scanning
-- and sorting records that are pending, rejected, or already expired.

create index verification_records_expiry_due_idx
on public.verification_records (
  document_expiration_date,
  submitted_at,
  id
)
where status = 'verified';
