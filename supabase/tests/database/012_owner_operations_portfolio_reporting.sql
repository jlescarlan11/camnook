begin;

select '1..1';

insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('a0000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('a0000000-0000-4000-8000-000000000001', 'Portfolio Admin', '+639600000001'),
  ('a0000000-0000-4000-8000-000000000002', 'Portfolio Renter', '+639600000002'),
  ('a0000000-0000-4000-8000-000000000003', 'Other Portfolio Renter', '+639600000003');

insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, acquisition_cost, published_at,
  archived_at, created_at
) values
  (
    'a0100000-0000-4000-8000-000000000001',
    'portfolio-published', 'PRIVATE-PORTFOLIO-SERIAL-001',
    'Portfolio Published', 'Published portfolio fixture.', 'published',
    1000, 4000, 10000, '2026-01-01 00:00:00+08', null,
    '2026-01-01 00:00:00+08'
  ),
  (
    'a0100000-0000-4000-8000-000000000002',
    'portfolio-draft', 'PRIVATE-PORTFOLIO-SERIAL-002',
    'Portfolio Draft', null, 'draft',
    null, null, 0, null, null, '2026-01-01 00:00:00+08'
  ),
  (
    'a0100000-0000-4000-8000-000000000003',
    'portfolio-archived', 'PRIVATE-PORTFOLIO-SERIAL-003',
    'Portfolio Archived', 'Archived portfolio fixture.', 'archived',
    900, 3000, null, '2026-01-01 00:00:00+08',
    '2026-11-15 00:00:00+08', '2026-01-01 00:00:00+08'
  );

insert into public.contract_templates (
  id, version, schema_version, terms, content_sha256, created_by,
  approved_at, approved_by, activated_at
) values (
  'a0200000-0000-4000-8000-000000000001',
  'portfolio-template-v1', 1,
  '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb,
  extensions.digest(convert_to('portfolio-template-v1', 'UTF8'), 'sha256'),
  'a0000000-0000-4000-8000-000000000001',
  '2026-01-02 00:00:00+08', 'a0000000-0000-4000-8000-000000000001',
  '2026-01-02 00:00:00+08'
);

set constraints all deferred;

insert into public.bookings (
  id, renter_id, camera_id, state, pickup_at, return_at,
  intended_use, expected_location, requested_at, approved_at,
  approval_deadline_at, approved_by, billable_days_snapshot,
  daily_rate_snapshot, rental_amount, security_deposit_amount,
  current_contract_version_id
) values
  (
    'a0300000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'FOR_REVIEW',
    '2026-11-10 09:00:00+08', '2026-11-11 09:00:00+08',
    'Review queue fixture', 'CamNook counter', '2026-08-01 01:00:00+08',
    null, null, null, null, null, null, null, null
  ),
  (
    'a0300000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'CONTRACT_PENDING',
    statement_timestamp() + interval '30 days',
    statement_timestamp() + interval '31 days',
    'Signature queue fixture', 'CamNook counter', '2026-08-01 02:00:00+08',
    statement_timestamp() + interval '1 day',
    statement_timestamp() + interval '2 days',
    'a0000000-0000-4000-8000-000000000001', 1, 1000, 1000, 4000,
    'a0400000-0000-4000-8000-000000000002'
  ),
  (
    'a0300000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'PAYMENT_REVIEW',
    '2026-11-14 09:00:00+08', '2026-11-15 09:00:00+08',
    'Payment queue fixture', 'CamNook counter', '2026-08-01 03:00:00+08',
    '2026-08-16 00:00:00+08', '2026-08-17 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 1, 1000, 1000, 4000,
    'a0400000-0000-4000-8000-000000000003'
  ),
  (
    'a0300000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000002', 'CONFIRMED',
    '2026-11-16 09:00:00+08', '2026-11-17 09:00:00+08',
    'Pickup queue fixture', 'CamNook counter', '2026-07-01 01:00:00+08',
    '2026-07-02 00:00:00+08', '2026-07-03 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 1, 500, 500, 500,
    'a0400000-0000-4000-8000-000000000004'
  ),
  (
    'a0300000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000002', 'ACTIVE',
    '2026-11-18 09:00:00+08', '2026-11-19 09:00:00+08',
    'Active rental fixture', 'CamNook counter', '2026-06-01 01:00:00+08',
    '2026-06-02 00:00:00+08', '2026-06-03 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 1, 1000, 1000, 2000,
    'a0400000-0000-4000-8000-000000000005'
  ),
  (
    'a0300000-0000-4000-8000-000000000006',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'RETURN_REVIEW',
    '2026-11-20 09:00:00+08', '2026-11-21 09:00:00+08',
    'Return review fixture', 'CamNook counter', '2026-05-01 01:00:00+08',
    '2026-05-02 00:00:00+08', '2026-05-03 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 1, 1000, 1000, 0,
    'a0400000-0000-4000-8000-000000000006'
  ),
  (
    'a0300000-0000-4000-8000-000000000007',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'ISSUE_REVIEW',
    '2026-11-21 09:00:00+08', '2026-11-22 09:00:00+08',
    'Issue review fixture', 'CamNook counter', '2026-04-01 01:00:00+08',
    '2026-04-02 00:00:00+08', '2026-04-03 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 1, 1000, 1000, 0,
    'a0400000-0000-4000-8000-000000000007'
  ),
  (
    'a0300000-0000-4000-8000-000000000008',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'COMPLETED',
    '2026-11-10 00:00:00+08', '2026-11-12 00:00:00+08',
    'Reversed revenue fixture', 'CamNook counter', '2026-03-01 01:00:00+08',
    '2026-03-02 00:00:00+08', '2026-03-03 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 2, 1000, 2000, 4000,
    'a0400000-0000-4000-8000-000000000008'
  ),
  (
    'a0300000-0000-4000-8000-000000000009',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'COMPLETED',
    '2026-11-11 00:00:00+08', '2026-11-13 00:00:00+08',
    'Net revenue and refund fixture', 'CamNook counter', '2026-02-01 01:00:00+08',
    '2026-02-02 00:00:00+08', '2026-02-03 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 3, 1000, 3000, 4000,
    'a0400000-0000-4000-8000-000000000009'
  ),
  (
    'a0300000-0000-4000-8000-000000000010',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'CONTRACT_PENDING',
    statement_timestamp() + interval '30 days',
    statement_timestamp() + interval '31 days',
    'Due-today signature fixture', 'CamNook counter',
    statement_timestamp() - interval '2 days',
    (((statement_timestamp() at time zone 'Asia/Manila')::date + time '23:59:59.999999') at time zone 'Asia/Manila') - interval '24 hours',
    ((statement_timestamp() at time zone 'Asia/Manila')::date + time '23:59:59.999999') at time zone 'Asia/Manila',
    'a0000000-0000-4000-8000-000000000001', 1, 1000, 1000, 4000,
    'a0400000-0000-4000-8000-000000000010'
  ),
  (
    'a0300000-0000-4000-8000-000000000011',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'CONTRACT_PENDING',
    statement_timestamp() + interval '30 days',
    statement_timestamp() + interval '31 days',
    'Expired signature fixture', 'CamNook counter',
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '25 hours',
    statement_timestamp() - interval '1 hour',
    'a0000000-0000-4000-8000-000000000001', 1, 1000, 1000, 4000,
    'a0400000-0000-4000-8000-000000000011'
  ),
  (
    'a0300000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000003', 'COMPLETED',
    '2026-11-14 00:00:00+08', '2026-11-17 00:00:00+08',
    'Archived-window clipping fixture', 'CamNook counter',
    '2026-01-01 01:00:00+08',
    '2026-01-02 00:00:00+08', '2026-01-03 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 3, 0, 0, 0,
    'a0400000-0000-4000-8000-000000000012'
  );

insert into public.contract_versions (
  id, booking_id, version_no, template_id, snapshot,
  snapshot_schema_version, content_sha256, issued_at, issued_by
)
select
  ('a0400000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  booking.id,
  1,
  'a0200000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'booking', jsonb_build_object('id', booking.id),
    'renter', jsonb_build_object('legal_name', profile.legal_name),
    'camera', jsonb_build_object(
      'id', camera.id,
      'serial_number', camera.serial_number,
      'accessories', '[]'::jsonb
    )
  ),
  1,
  extensions.digest(convert_to('portfolio-contract-' || item::text, 'UTF8'), 'sha256'),
  '2026-01-03 00:00:00+08',
  'a0000000-0000-4000-8000-000000000001'
from generate_series(2, 12) as item
join public.bookings as booking
  on booking.id = (
    'a0300000-0000-4000-8000-' || lpad(item::text, 12, '0')
  )::uuid
join public.profiles as profile on profile.user_id = booking.renter_id
join public.cameras as camera on camera.id = booking.camera_id;

insert into public.contract_signatures (
  id, contract_version_id, renter_id, signature_intent, attestation_text,
  signed_at, acknowledged_content_sha256
) values
  (
    'a0500000-0000-4000-8000-000000000003',
    'a0400000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002',
    'I accept', 'I accept the immutable contract.', '2026-07-03 00:00:00+08',
    extensions.digest(convert_to('portfolio-contract-3', 'UTF8'), 'sha256')
  ),
  (
    'a0500000-0000-4000-8000-000000000004',
    'a0400000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000002',
    'I accept', 'I accept the immutable contract.', '2026-07-03 00:00:00+08',
    extensions.digest(convert_to('portfolio-contract-4', 'UTF8'), 'sha256')
  );

insert into public.verification_records (
  id, user_id, status, id_type, document_expiration_date,
  submitted_at, decided_at, decided_by
) values (
  'a0600000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002', 'verified', 'government-id',
  '2027-12-31', '2026-01-04 00:00:00+08', '2026-01-04 01:00:00+08',
  'a0000000-0000-4000-8000-000000000001'
);

insert into public.payment_transactions (
  id, booking_id, direction, status, amount, reference,
  counterparty_display_name, submitted_at, submitted_by, decided_at,
  decided_by, reversal_of, submission_attempt_id, contract_version_id,
  recipient_config_version, recipient_name_snapshot, recipient_account_snapshot
) values
  (
    'a0700000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000003', 'incoming', 'submitted', 5000,
    'PRIVATE-PAYMENT-REFERENCE-003', 'Private Sender Name',
    '2026-08-15 00:00:00+08', 'a0000000-0000-4000-8000-000000000002',
    null, null, null, 'a0700000-0000-4000-8000-000000000103',
    'a0400000-0000-4000-8000-000000000003', 1,
    'Private Recipient', '09171234567'
  ),
  (
    'a0700000-0000-4000-8000-000000000004',
    'a0300000-0000-4000-8000-000000000004', 'incoming', 'verified', 1000,
    'PRIVATE-PAYMENT-REFERENCE-004', 'Portfolio Renter',
    '2026-07-04 00:00:00+08', 'a0000000-0000-4000-8000-000000000002',
    '2026-07-04 01:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    null, 'a0700000-0000-4000-8000-000000000104',
    'a0400000-0000-4000-8000-000000000004', 1,
    'Private Recipient', '09171234567'
  ),
  (
    'a0700000-0000-4000-8000-000000000005',
    'a0300000-0000-4000-8000-000000000005', 'incoming', 'verified', 3000,
    'PRIVATE-PAYMENT-REFERENCE-005', 'Portfolio Renter',
    '2026-06-04 00:00:00+08', 'a0000000-0000-4000-8000-000000000002',
    '2026-07-05 01:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    null, 'a0700000-0000-4000-8000-000000000105',
    'a0400000-0000-4000-8000-000000000005', 1,
    'Private Recipient', '09171234567'
  ),
  (
    'a0700000-0000-4000-8000-000000000006',
    'a0300000-0000-4000-8000-000000000006', 'incoming', 'verified', 1000,
    'PRIVATE-PAYMENT-REFERENCE-006', 'Portfolio Renter',
    '2026-11-09 00:00:00+08', 'a0000000-0000-4000-8000-000000000002',
    '2026-11-09 00:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    null, 'a0700000-0000-4000-8000-000000000106',
    'a0400000-0000-4000-8000-000000000006', 1,
    'Private Recipient', '09171234567'
  ),
  (
    'a0700000-0000-4000-8000-000000000007',
    'a0300000-0000-4000-8000-000000000007', 'incoming', 'verified', 1000,
    'PRIVATE-PAYMENT-REFERENCE-007', 'Portfolio Renter',
    '2026-11-23 00:00:00+08', 'a0000000-0000-4000-8000-000000000002',
    '2026-11-23 00:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    null, 'a0700000-0000-4000-8000-000000000107',
    'a0400000-0000-4000-8000-000000000007', 1,
    'Private Recipient', '09171234567'
  ),
  (
    'a0700000-0000-4000-8000-000000000008',
    'a0300000-0000-4000-8000-000000000008', 'incoming', 'verified', 6000,
    'PRIVATE-PAYMENT-REFERENCE-008', 'Portfolio Renter',
    '2026-11-10 00:00:00+08', 'a0000000-0000-4000-8000-000000000002',
    '2026-11-10 01:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    null, 'a0700000-0000-4000-8000-000000000108',
    'a0400000-0000-4000-8000-000000000008', 1,
    'Private Recipient', '09171234567'
  ),
  (
    'a0700000-0000-4000-8000-000000000018',
    'a0300000-0000-4000-8000-000000000008', 'outgoing', 'verified', 6000,
    'PRIVATE-PAYMENT-REVERSAL-018', 'Portfolio correction',
    '2026-11-10 02:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    '2026-11-10 02:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    'a0700000-0000-4000-8000-000000000008', null, null, null, null, null
  ),
  (
    'a0700000-0000-4000-8000-000000000009',
    'a0300000-0000-4000-8000-000000000009', 'incoming', 'verified', 7000,
    'PRIVATE-PAYMENT-REFERENCE-009', 'Portfolio Renter',
    '2026-11-11 00:00:00+08', 'a0000000-0000-4000-8000-000000000002',
    '2026-11-11 01:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    null, 'a0700000-0000-4000-8000-000000000109',
    'a0400000-0000-4000-8000-000000000009', 1,
    'Private Recipient', '09171234567'
  ),
  (
    'a0700000-0000-4000-8000-000000000029',
    'a0300000-0000-4000-8000-000000000009', 'outgoing', 'verified', 1500,
    'PRIVATE-REFUND-REFERENCE-029', 'Portfolio Renter',
    '2026-11-12 00:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    '2026-11-12 00:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    null, null, null, null, null, null
  ),
  (
    'a0700000-0000-4000-8000-000000000039',
    'a0300000-0000-4000-8000-000000000009', 'incoming', 'verified', 1500,
    'PRIVATE-REFUND-REVERSAL-039', 'Portfolio correction',
    '2026-11-12 01:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    '2026-11-12 01:00:00+08', 'a0000000-0000-4000-8000-000000000001',
    'a0700000-0000-4000-8000-000000000029',
    'a0700000-0000-4000-8000-000000000139',
    'a0400000-0000-4000-8000-000000000009', 1,
    'Private Recipient', '09171234567'
  );

insert into public.payment_allocations (transaction_id, booking_id, kind, amount) values
  ('a0700000-0000-4000-8000-000000000004', 'a0300000-0000-4000-8000-000000000004', 'rental_payment', 500),
  ('a0700000-0000-4000-8000-000000000004', 'a0300000-0000-4000-8000-000000000004', 'security_deposit', 500),
  ('a0700000-0000-4000-8000-000000000005', 'a0300000-0000-4000-8000-000000000005', 'rental_payment', 1000),
  ('a0700000-0000-4000-8000-000000000005', 'a0300000-0000-4000-8000-000000000005', 'security_deposit', 2000),
  ('a0700000-0000-4000-8000-000000000006', 'a0300000-0000-4000-8000-000000000006', 'rental_payment', 1000),
  ('a0700000-0000-4000-8000-000000000006', 'a0300000-0000-4000-8000-000000000006', 'security_deposit', 0),
  ('a0700000-0000-4000-8000-000000000007', 'a0300000-0000-4000-8000-000000000007', 'rental_payment', 1000),
  ('a0700000-0000-4000-8000-000000000007', 'a0300000-0000-4000-8000-000000000007', 'security_deposit', 0),
  ('a0700000-0000-4000-8000-000000000008', 'a0300000-0000-4000-8000-000000000008', 'rental_payment', 2000),
  ('a0700000-0000-4000-8000-000000000008', 'a0300000-0000-4000-8000-000000000008', 'security_deposit', 4000),
  ('a0700000-0000-4000-8000-000000000018', 'a0300000-0000-4000-8000-000000000008', 'rental_payment', 2000),
  ('a0700000-0000-4000-8000-000000000018', 'a0300000-0000-4000-8000-000000000008', 'security_deposit', 4000),
  ('a0700000-0000-4000-8000-000000000009', 'a0300000-0000-4000-8000-000000000009', 'rental_payment', 3000),
  ('a0700000-0000-4000-8000-000000000009', 'a0300000-0000-4000-8000-000000000009', 'security_deposit', 4000),
  ('a0700000-0000-4000-8000-000000000029', 'a0300000-0000-4000-8000-000000000009', 'deposit_refund', 1500),
  ('a0700000-0000-4000-8000-000000000039', 'a0300000-0000-4000-8000-000000000009', 'deposit_refund', 1500);

insert into public.handoffs (
  id, booking_id, type, conducted_by, named_renter_present,
  original_id_checked, original_id_matched, camera_serial_checked,
  accessory_checklist_completed, actual_at
) values
  (
    'a0800000-0000-4000-8000-000000000005',
    'a0300000-0000-4000-8000-000000000005', 'pickup',
    'a0000000-0000-4000-8000-000000000001', true, true, true, true, true,
    '2026-11-18 09:00:00+08'
  ),
  (
    'a0800000-0000-4000-8000-000000000006',
    'a0300000-0000-4000-8000-000000000006', 'return',
    'a0000000-0000-4000-8000-000000000001', null, null, null, true, true,
    '2026-11-21 08:00:00+08'
  ),
  (
    'a0800000-0000-4000-8000-000000000007',
    'a0300000-0000-4000-8000-000000000007', 'return',
    'a0000000-0000-4000-8000-000000000001', null, null, null, true, true,
    '2026-11-22 10:00:00+08'
  ),
  (
    'a0800000-0000-4000-8000-000000000009',
    'a0300000-0000-4000-8000-000000000009', 'return',
    'a0000000-0000-4000-8000-000000000001', null, null, null, true, true,
    '2026-11-13 00:00:00+08'
  );

insert into public.condition_reports (
  id, handoff_id, camera_condition_summary, accessory_checklist_snapshot,
  has_damage, has_missing_items, reported_by, created_at
) values
  (
    'a0900000-0000-4000-8000-000000000006',
    'a0800000-0000-4000-8000-000000000006', 'Return awaiting review.',
    '[]'::jsonb, false, false, 'a0000000-0000-4000-8000-000000000001',
    '2026-11-21 08:00:00+08'
  ),
  (
    'a0900000-0000-4000-8000-000000000007',
    'a0800000-0000-4000-8000-000000000007', 'Damage requires review.',
    '[]'::jsonb, true, false, 'a0000000-0000-4000-8000-000000000001',
    '2026-11-22 10:00:00+08'
  ),
  (
    'a0900000-0000-4000-8000-000000000009',
    'a0800000-0000-4000-8000-000000000009', 'Completed issue review.',
    '[]'::jsonb, true, false, 'a0000000-0000-4000-8000-000000000001',
    '2026-11-13 00:00:00+08'
  );

insert into public.return_issue_decisions (
  id, booking_id, condition_report_id, decision_kind, deduction_amount,
  internal_reason, customer_explanation, decided_by, decided_at, operation_id
) values (
  'a1000000-0000-4000-8000-000000000009',
  'a0300000-0000-4000-8000-000000000009',
  'a0900000-0000-4000-8000-000000000009', 'damage', 1000,
  'Private damage assessment.', 'Damage deduction approved.',
  'a0000000-0000-4000-8000-000000000001', '2026-11-13 01:00:00+08',
  'a1000000-0000-4000-8000-000000000109'
);

insert into public.deposit_deductions (
  id, booking_id, issue_decision_id, amount, reason_snapshot,
  recorded_by, recorded_at, operation_id
) values (
  'a1100000-0000-4000-8000-000000000009',
  'a0300000-0000-4000-8000-000000000009',
  'a1000000-0000-4000-8000-000000000009', 1000,
  'Private damage assessment.', 'a0000000-0000-4000-8000-000000000001',
  '2026-11-13 01:00:00+08', 'a1100000-0000-4000-8000-000000000109'
);

insert into public.deposit_refund_records (
  id, booking_id, transaction_id, entry_kind, amount, external_moved_at,
  reversal_of, reversal_reason, recorded_by, recorded_at, operation_id
) values
  (
    'a1200000-0000-4000-8000-000000000009',
    'a0300000-0000-4000-8000-000000000009',
    'a0700000-0000-4000-8000-000000000029', 'refund', 1500,
    '2026-11-12 00:00:00+08', null, null,
    'a0000000-0000-4000-8000-000000000001', '2026-11-12 00:00:00+08',
    'a1200000-0000-4000-8000-000000000109'
  ),
  (
    'a1200000-0000-4000-8000-000000000019',
    'a0300000-0000-4000-8000-000000000009',
    'a0700000-0000-4000-8000-000000000039', 'reversal', 1500,
    '2026-11-12 01:00:00+08',
    'a1200000-0000-4000-8000-000000000009', 'External refund was reversed.',
    'a0000000-0000-4000-8000-000000000001', '2026-11-12 01:00:00+08',
    'a1200000-0000-4000-8000-000000000119'
  );

insert into public.availability_blocks (
  id, camera_id, kind, starts_at, ends_at, created_by, reason, released_at,
  released_by
) values
  (
    'a1300000-0000-4000-8000-000000000001',
    'a0100000-0000-4000-8000-000000000001', 'maintenance',
    '2026-11-13 00:00:00+08', '2026-11-14 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 'Private maintenance note.',
    '2026-11-14 00:00:00+08', 'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'a1300000-0000-4000-8000-000000000002',
    'a0100000-0000-4000-8000-000000000001', 'manual',
    '2026-11-14 00:00:00+08', '2026-11-15 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001', 'Private manual note.',
    '2026-11-15 00:00:00+08', 'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'a1300000-0000-4000-8000-000000000003',
    'a0100000-0000-4000-8000-000000000001', 'manual',
    '2026-11-21 00:00:00+08', '2026-11-22 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001',
    'Private early-release note.',
    '2026-11-20 00:00:00+08', 'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'a1300000-0000-4000-8000-000000000004',
    'a0100000-0000-4000-8000-000000000003', 'maintenance',
    '2026-11-14 00:00:00+08', '2026-11-17 00:00:00+08',
    'a0000000-0000-4000-8000-000000000001',
    'Private archived-window maintenance note.',
    null, null
  );

insert into public.booking_state_history (
  booking_id, from_state, to_state, actor_user_id, actor_type, reason_code,
  occurred_at
) values
  ('a0300000-0000-4000-8000-000000000001', null, 'FOR_REVIEW', 'a0000000-0000-4000-8000-000000000002', 'renter', 'booking_requested', '2026-08-01 01:00:00+08'),
  ('a0300000-0000-4000-8000-000000000002', 'FOR_REVIEW', 'CONTRACT_PENDING', 'a0000000-0000-4000-8000-000000000001', 'admin', 'booking_approved', '2026-08-16 00:00:00+08'),
  ('a0300000-0000-4000-8000-000000000003', 'TO_PAY', 'PAYMENT_REVIEW', 'a0000000-0000-4000-8000-000000000002', 'renter', 'payment_submitted', '2026-08-15 00:00:00+08'),
  ('a0300000-0000-4000-8000-000000000004', 'PAYMENT_REVIEW', 'CONFIRMED', 'a0000000-0000-4000-8000-000000000001', 'admin', 'payment_verified', '2026-07-04 01:00:00+08'),
  ('a0300000-0000-4000-8000-000000000005', 'CONFIRMED', 'ACTIVE', 'a0000000-0000-4000-8000-000000000001', 'admin', 'pickup_completed', '2026-11-18 09:00:00+08'),
  ('a0300000-0000-4000-8000-000000000006', 'ACTIVE', 'RETURN_REVIEW', 'a0000000-0000-4000-8000-000000000001', 'admin', 'return_recorded', '2026-11-21 08:00:00+08'),
  ('a0300000-0000-4000-8000-000000000007', 'RETURN_REVIEW', 'ISSUE_REVIEW', 'a0000000-0000-4000-8000-000000000001', 'admin', 'return_issue_detected', '2026-11-22 10:00:00+08'),
  ('a0300000-0000-4000-8000-000000000008', 'RETURN_REVIEW', 'COMPLETED', 'a0000000-0000-4000-8000-000000000001', 'admin', 'return_completed', '2026-11-12 00:00:00+08'),
  ('a0300000-0000-4000-8000-000000000009', 'ISSUE_REVIEW', 'COMPLETED', 'a0000000-0000-4000-8000-000000000001', 'admin', 'issue_resolved', '2026-11-13 01:00:00+08'),
  ('a0300000-0000-4000-8000-000000000010', 'FOR_REVIEW', 'CONTRACT_PENDING', 'a0000000-0000-4000-8000-000000000001', 'admin', 'booking_approved', statement_timestamp() - interval '1 day'),
  ('a0300000-0000-4000-8000-000000000011', 'FOR_REVIEW', 'CONTRACT_PENDING', 'a0000000-0000-4000-8000-000000000001', 'admin', 'booking_approved', statement_timestamp() - interval '25 hours'),
  ('a0300000-0000-4000-8000-000000000012', 'RETURN_REVIEW', 'COMPLETED', 'a0000000-0000-4000-8000-000000000001', 'admin', 'return_completed', '2026-11-17 00:00:00+08');

set constraints all immediate;
set constraints all deferred;

do $$
begin
  begin
    insert into public.payment_transactions (
      id, booking_id, direction, status, amount, reference,
      counterparty_display_name, submitted_at, submitted_by, decided_at,
      decided_by, reversal_of, submission_attempt_id, contract_version_id,
      recipient_config_version, recipient_name_snapshot,
      recipient_account_snapshot
    ) values (
      'a0700000-0000-4000-8000-000000000099',
      'a0300000-0000-4000-8000-000000000004',
      'incoming', 'verified', 1000, 'MISATTRIBUTED-PAYMENT',
      'Synthetic wrong-booking test', '2026-11-12 00:00:00+08',
      'a0000000-0000-4000-8000-000000000002',
      '2026-11-12 01:00:00+08',
      'a0000000-0000-4000-8000-000000000001', null,
      'a0700000-0000-4000-8000-000000000199',
      'a0400000-0000-4000-8000-000000000004', 1,
      'Private Recipient', '09171234567'
    );

    insert into public.payment_allocations (
      transaction_id, booking_id, kind, amount
    ) values
      (
        'a0700000-0000-4000-8000-000000000099',
        'a0300000-0000-4000-8000-000000000005',
        'rental_payment', 500
      ),
      (
        'a0700000-0000-4000-8000-000000000099',
        'a0300000-0000-4000-8000-000000000005',
        'security_deposit', 500
      );

    perform private.check_payment_allocation_balance(
      'a0700000-0000-4000-8000-000000000099'
    );
    raise exception 'a verified payment was attributed to another booking';
  exception when check_violation then null;
  end;
end;
$$;

do $$
begin
  if has_function_privilege(
      'anon', 'api.get_owner_operations_dashboard()', 'EXECUTE'
    )
    or has_function_privilege(
      'service_role', 'api.get_owner_operations_dashboard()', 'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'api.get_owner_portfolio_report(date,date)', 'EXECUTE'
    )
    or has_function_privilege(
      'service_role', 'api.get_owner_portfolio_report(date,date)', 'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'private.get_owner_operations_dashboard()', 'EXECUTE'
    )
    or has_function_privilege(
      'service_role', 'private.get_owner_operations_dashboard()', 'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'private.get_owner_portfolio_report(date,date)', 'EXECUTE'
    )
    or has_function_privilege(
      'service_role', 'private.get_owner_portfolio_report(date,date)', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'api.get_owner_operations_dashboard()', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'api.get_owner_portfolio_report(date,date)', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'private.get_owner_operations_dashboard()', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'private.get_owner_portfolio_report(date,date)', 'EXECUTE'
    )
  then
    raise exception 'owner projection execute privileges were broader or narrower than intended';
  end if;

  if has_function_privilege(
      'anon', 'api.get_admin_booking_detail_snapshot(uuid)', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'api.get_admin_booking_detail_snapshot(uuid)', 'EXECUTE'
    )
    or has_function_privilege(
      'authenticated', 'private.get_admin_booking_detail_snapshot(uuid)', 'EXECUTE'
    )
  then
    raise exception 'admin booking snapshot privileges were broader or narrower than intended';
  end if;

  if has_function_privilege(
      'anon', 'api.get_admin_contract_context(uuid)', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'api.get_admin_contract_context(uuid)', 'EXECUTE'
    )
    or has_function_privilege(
      'authenticated', 'private.get_admin_contract_context(uuid)', 'EXECUTE'
    )
  then
    raise exception 'admin contract context privileges were broader or narrower than intended';
  end if;

  if has_function_privilege(
      'anon', 'api.get_my_booking_detail_context(uuid)', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'api.get_my_booking_detail_context(uuid)', 'EXECUTE'
    )
    or has_function_privilege(
      'authenticated', 'private.get_my_booking_detail_context(uuid)', 'EXECUTE'
    )
  then
    raise exception 'renter booking context privileges were broader or narrower than intended';
  end if;

  if has_function_privilege(
      'anon', 'api.get_my_account_overview()', 'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated', 'api.get_my_account_overview()', 'EXECUTE'
    )
    or has_function_privilege(
      'authenticated', 'private.get_my_account_overview()', 'EXECUTE'
    )
  then
    raise exception 'renter account overview privileges were broader or narrower than intended';
  end if;
end;
$$;

set local role anon;

do $$
begin
  begin
    perform api.get_owner_operations_dashboard();
    raise exception 'anon executed the owner operations projection';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_owner_portfolio_report('2026-11-09', '2026-11-23');
    raise exception 'anon executed the owner portfolio projection';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_admin_booking_detail_snapshot(
      'a0300000-0000-4000-8000-000000000001'
    );
    raise exception 'anon executed the admin booking snapshot';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_admin_contract_context(
      'a0300000-0000-4000-8000-000000000003'
    );
    raise exception 'anon executed the admin contract context';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_my_booking_detail_context(
      'a0300000-0000-4000-8000-000000000001'
    );
    raise exception 'anon executed the renter booking context';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_my_account_overview();
    raise exception 'anon executed the renter account overview';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = 'a0000000-0000-4000-8000-000000000003';

do $$
begin
  begin
    perform api.get_owner_operations_dashboard();
    raise exception 'a renter executed the owner operations projection';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_owner_portfolio_report('2026-11-09', '2026-11-23');
    raise exception 'a renter executed the owner portfolio projection';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_admin_booking_detail_snapshot(
      'a0300000-0000-4000-8000-000000000001'
    );
    raise exception 'a renter executed the admin booking snapshot';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_admin_contract_context(
      'a0300000-0000-4000-8000-000000000003'
    );
    raise exception 'a renter executed the admin contract context';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.get_my_booking_detail_context(
      'a0300000-0000-4000-8000-000000000001'
    );
    raise exception 'a different renter read the booking context';
  exception when no_data_found then null;
  end;


  if jsonb_array_length(api.get_my_account_overview() -> 'bookings') <> 0
    or api.get_my_account_overview() #>> '{profile,legal_name}'
      <> 'Other Portfolio Renter'
  then
    raise exception 'renter account overview crossed ownership boundaries';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = 'a0000000-0000-4000-8000-000000000002';

do $$
declare
  unapproved jsonb := api.get_my_booking_detail_context(
    'a0300000-0000-4000-8000-000000000001'
  );
  approved jsonb := api.get_my_booking_detail_context(
    'a0300000-0000-4000-8000-000000000003'
  );
  overview jsonb := api.get_my_account_overview();
begin
  if unapproved #>> '{booking,id}'
      <> 'a0300000-0000-4000-8000-000000000001'
    or unapproved #>> '{camera,name}' <> 'Portfolio Published'
    or jsonb_array_length(unapproved -> 'versions') <> 0
    or unapproved #>> '{payment,booking_id}'
      <> 'a0300000-0000-4000-8000-000000000001'
    or unapproved #>> '{pickup,booking_id}'
      <> 'a0300000-0000-4000-8000-000000000001'
    or unapproved #>> '{resolution,booking_id}'
      <> 'a0300000-0000-4000-8000-000000000001'
    or approved #>> '{versions,0,id}'
      <> 'a0400000-0000-4000-8000-000000000003'
    or approved #>> '{versions,0,signature,id}'
      <> 'a0500000-0000-4000-8000-000000000003'
    or unapproved::text ~* 'operator_notes|object_path|provider_place_id|renter_city_provider_id|signature_intent|attestation_text|request_ip_digest|user_agent_digest'
    or approved::text ~* 'operator_notes|object_path|provider_place_id|renter_city_provider_id|signature_intent|attestation_text|request_ip_digest|user_agent_digest'
  then
    raise exception 'renter booking context was incomplete, cross-owned, or overexposed';
  end if;

  if overview #>> '{profile,legal_name}' <> 'Portfolio Renter'
    or jsonb_array_length(overview -> 'bookings') < 10
    or not exists (
      select 1
      from jsonb_array_elements(overview -> 'bookings') as source(item)
      where item #>> '{booking,id}'
        = 'a0300000-0000-4000-8000-000000000001'
        and item #>> '{camera,name}' = 'Portfolio Published'
    )
    or overview::text ~* 'renter_id|operator_notes|serial_number|acquisition_cost|object_path|provider_place_id|renter_city_provider_id'
  then
    raise exception 'renter account overview was incomplete or overexposed';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = 'a0000000-0000-4000-8000-000000000001';

do $$
declare
  dashboard jsonb := api.get_owner_operations_dashboard();
  report jsonb := api.get_owner_portfolio_report('2026-11-09', '2026-11-23');
  booking_detail jsonb := api.get_admin_booking_detail_snapshot(
    'a0300000-0000-4000-8000-000000000001'
  );
  contract_context jsonb := api.get_admin_contract_context(
    'a0300000-0000-4000-8000-000000000003'
  );
  camera_revenue numeric;
begin
  if dashboard #>> '{queue_counts,review}' <> '1'
    or dashboard #>> '{queue_counts,signature}' <> '3'
    or dashboard #>> '{queue_counts,payment}' <> '1'
    or dashboard #>> '{queue_counts,pickup}' <> '1'
    or dashboard #>> '{queue_counts,active_rental}' <> '1'
    or dashboard #>> '{queue_counts,return}' <> '2'
    or dashboard #>> '{queue_counts,issue_review}' <> '1'
    or dashboard #>> '{queue_counts,held_deposit}' <> '2'
    or dashboard #>> '{queue_counts,pending_refund}' <> '1'
  then
    raise exception 'owner dashboard did not represent all nine authoritative work queues: %',
      dashboard -> 'queue_counts';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(dashboard #> '{queues,signature}') source(item)
    where item ->> 'urgency' = 'open'
  ) or not exists (
    select 1 from jsonb_array_elements(dashboard #> '{queues,signature}') source(item)
    where item ->> 'urgency' = 'due_today'
  ) or not exists (
    select 1 from jsonb_array_elements(dashboard #> '{queues,signature}') source(item)
    where item ->> 'urgency' = 'expired'
  ) then
    raise exception 'signature deadline classification did not use all database-clock boundaries';
  end if;

  if dashboard #>> '{deposit_reconciliation,verified_deposit_total}' <> '6500.00'
    or dashboard #>> '{deposit_reconciliation,approved_deduction_total}' <> '1000.00'
    or dashboard #>> '{deposit_reconciliation,externally_refunded_total}' <> '0.00'
    or dashboard #>> '{deposit_reconciliation,remaining_liability_total}' <> '5500.00'
    or dashboard #>> '{deposit_reconciliation,held_liability_total}' <> '2500.00'
    or dashboard #>> '{deposit_reconciliation,pending_refund_total}' <> '3000.00'
  then
    raise exception 'deposit liabilities did not reconcile through immutable reversals';
  end if;

  if booking_detail #>> '{booking,id}'
      <> 'a0300000-0000-4000-8000-000000000001'
    or booking_detail #>> '{profile,legal_name}' <> 'Portfolio Renter'
    or booking_detail #>> '{camera,name}' <> 'Portfolio Published'
    or booking_detail #>> '{quote,total_due}' <> '5000.00'
    or booking_detail::text ~* 'PRIVATE-PORTFOLIO-SERIAL|acquisition_cost|object_path|sha256|provider_place_id|renter_city_provider_id|actor_user_id|operation_id'
  then
    raise exception 'admin booking snapshot was incomplete or overexposed';
  end if;

  if jsonb_array_length(contract_context -> 'versions') <> 1
    or contract_context #>> '{versions,0,id}'
      <> 'a0400000-0000-4000-8000-000000000003'
    or contract_context #>> '{versions,0,signature,id}'
      <> 'a0500000-0000-4000-8000-000000000003'
    or jsonb_array_length(contract_context -> 'audit') = 0
    or jsonb_array_length(contract_context -> 'cameras') <> 1
    or contract_context::text ~* 'signature_intent|attestation_text|request_ip_digest|user_agent_digest'
  then
    raise exception 'admin contract context was incomplete or overexposed';
  end if;

  begin
    perform api.get_admin_booking_detail_snapshot(
      'aaaaaaaa-ffff-4000-8000-000000000000'
    );
    raise exception 'missing admin booking snapshot returned success';
  exception when no_data_found then null;
  end;

  if dashboard::text ~* 'PRIVATE-PAYMENT|Private Sender|Private Recipient|PRIVATE-PORTFOLIO-SERIAL|government-id|Private damage|Private maintenance|Private manual|object_path|sha256|internal_notes|operator_notes|intended_use|expected_location|request_ip|user_agent'
  then
    raise exception 'owner dashboard projection exposed nonessential private facts';
  end if;

  if not ((dashboard #> '{queues,signature,0}') ? 'renter_phone')
    or not ((dashboard #> '{queues,active_rental,0}') ? 'renter_phone')
    or jsonb_set(
      jsonb_set(dashboard, '{queues,signature}', '[]'::jsonb),
      '{queues,active_rental}',
      '[]'::jsonb
    )::text ~ '"renter_phone"'
  then
    raise exception 'renter phone escaped its signature/active-rental allowlist';
  end if;

  select coalesce(sum((item ->> 'period_net_verified_rental_revenue')::numeric), 0)
  into camera_revenue
  from jsonb_array_elements(report -> 'cameras') as source(item);

  if report #>> '{period,time_zone}' <> 'Asia/Manila'
    or report #>> '{period,bounds}' <> '[)'
    or report #>> '{portfolio,period_net_verified_rental_revenue}' <> '4000.00'
    or camera_revenue <> 4000
    or report #>> '{portfolio,rental_utilized_seconds}' <> '691200'
    or report #>> '{portfolio,maintenance_seconds}' <> '172800'
    or report #>> '{portfolio,manual_unavailable_seconds}' <> '86400'
    or jsonb_array_length(report -> 'cameras') <> 3
    or report::text ~ 'PRIVATE-PORTFOLIO-SERIAL|acquisition_cost_snapshot|reference|recipient|sender|object_path|sha256|internal_notes'
  then
    raise exception 'portfolio report revenue, utilization, camera rollup, or minimization was incorrect';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(report -> 'cameras') as source(item)
    where item ->> 'camera_status' = 'archived'
      and item #>> '{cost_recovery,status}' = 'unavailable'
      and item ->> 'inventory_window_seconds' = '518400'
      and item ->> 'rental_utilized_seconds' = '86400'
      and item ->> 'maintenance_seconds' = '86400'
  ) or not exists (
    select 1
    from jsonb_array_elements(report -> 'cameras') as source(item)
    where item ->> 'camera_status' = 'draft'
      and item #>> '{cost_recovery,status}' = 'unavailable'
  ) or not exists (
    select 1
    from jsonb_array_elements(report -> 'cameras') as source(item)
    where item ->> 'camera_name' = 'Portfolio Published'
      and item #>> '{cost_recovery,recovered_amount}' = '5000.00'
      and item #>> '{cost_recovery,remaining_amount}' = '5000.00'
      and item #>> '{cost_recovery,recovery_percent}' = '50.00'
  ) then
    raise exception 'archived inventory or acquisition-cost recovery was incorrect';
  end if;

  begin
    perform api.get_owner_portfolio_report('2026-11-23', '2026-11-23');
    raise exception 'empty portfolio period was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

do $$
declare
  dashboard_definition text := pg_get_functiondef(
    'private.get_owner_operations_dashboard()'::regprocedure
  );
  snapshot_definition text := pg_get_functiondef(
    'private.get_owner_resolution_dashboard_snapshot()'::regprocedure
  );
  snapshot_call constant text :=
    'private.get_owner_resolution_dashboard_snapshot()';
begin
  if (
    char_length(dashboard_definition)
      - char_length(replace(dashboard_definition, snapshot_call, ''))
  ) / char_length(snapshot_call) <> 1
    or position('private.get_resolution_queues()' in dashboard_definition) <> 0
    or position('private.deposit_outcome_json(' in snapshot_definition) <> 0
    or position('''return_queue''' in snapshot_definition) <> 0
    or position('''deposit_queue''' in snapshot_definition) <> 0
  then
    raise exception 'owner dashboard did not use one minimized resolution snapshot';
  end if;
end;
$$;

do $$
declare
  dashboard_definition text := pg_get_functiondef(
    'private.get_owner_operations_dashboard()'::regprocedure
  );
  snapshot_definition text := pg_get_functiondef(
    'private.get_owner_deposit_dashboard_snapshot()'::regprocedure
  );
  snapshot_call constant text :=
    'private.get_owner_deposit_dashboard_snapshot()';
begin
  if (
    char_length(dashboard_definition)
      - char_length(replace(dashboard_definition, snapshot_call, ''))
  ) / char_length(snapshot_call) <> 1
    or position('private.deposit_outcome_json(' in dashboard_definition) <> 0
    or position('private.deposit_outcome_json(' in snapshot_definition) <> 0
    or position('with verified_deposits as materialized' in snapshot_definition) = 0
    or position('deductions as materialized' in snapshot_definition) = 0
    or position('refunds as materialized' in snapshot_definition) = 0
    or position('booking_liabilities as materialized' in snapshot_definition) = 0
  then
    raise exception 'owner dashboard did not use one set-based deposit snapshot';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from public.public_cameras
    where id in (
      'a0100000-0000-4000-8000-000000000002',
      'a0100000-0000-4000-8000-000000000003'
    )
  ) then
    raise exception 'unpublished inventory leaked into the public camera projection';
  end if;
end;
$$;

select 'ok 1 - owner operations, liability, revenue, utilization, recovery, authorization, and minimization';

rollback;
