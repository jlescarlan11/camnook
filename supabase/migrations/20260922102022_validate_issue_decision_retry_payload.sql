-- A decision replay must match the recorded amount, reasons, kind, booking, and actor.
-- Existing deductions, settlements, audit history, and grants remain unchanged.
create or replace function private.resolve_return_issue(
  p_booking_id uuid,
  p_decision_kind text,
  p_deduction_amount numeric,
  p_internal_reason text,
  p_customer_explanation text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  booking public.bookings%rowtype;
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  existing public.return_issue_decisions%rowtype;
  held numeric(12,2);
  late_return boolean;
  issue_count integer;
  evidence_count integer;
  decision_id uuid;
  deduction_id uuid;
  settlement public.deposit_settlements%rowtype;
begin
  if p_booking_id is null
    or p_decision_kind not in ('damage', 'missing_item', 'late_return', 'mixed', 'other')
    or p_deduction_amount is null
    or p_deduction_amount < 0
    or p_internal_reason is null
    or length(btrim(p_internal_reason)) not between 2 and 2000
    or private.resolution_text_has_forbidden_characters(p_internal_reason)
    or p_customer_explanation is null
    or length(btrim(p_customer_explanation)) not between 2 and 500
    or private.resolution_text_has_forbidden_characters(p_customer_explanation)
    or p_operation_id is null
  then
    raise exception 'issue_decision_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.return_issue_decisions
  where operation_id = p_operation_id;
  if existing.id is not null then
    if existing.booking_id is distinct from p_booking_id
      or existing.decision_kind is distinct from p_decision_kind
      or existing.deduction_amount is distinct from p_deduction_amount
      or existing.internal_reason is distinct from btrim(p_internal_reason)
      or existing.customer_explanation is distinct from btrim(p_customer_explanation)
      or existing.decided_by is distinct from caller
    then
      raise exception 'issue_decision_retry_changed' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'decision_id', existing.id,
      'booking_id', existing.booking_id,
      'booking_state', 'COMPLETED',
      'deduction_amount', existing.deduction_amount,
      'created', false
    );
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null or booking.state <> 'ISSUE_REVIEW' then
    raise exception 'issue_review_stale_booking_state' using errcode = '40001';
  end if;

  select * into handoff
  from public.handoffs
  where booking_id = booking.id and type = 'return'
  for share;
  select * into report
  from public.condition_reports
  where handoff_id = handoff.id
  for share;
  if handoff.id is null or report.id is null then
    raise exception 'return_report_not_found' using errcode = 'P0002';
  end if;

  late_return := handoff.actual_at > booking.return_at;
  issue_count := (report.has_damage::integer)
    + (report.has_missing_items::integer)
    + (late_return::integer);
  if issue_count = 0
    or (p_decision_kind = 'damage' and not report.has_damage)
    or (p_decision_kind = 'missing_item' and not report.has_missing_items)
    or (p_decision_kind = 'late_return' and not late_return)
    or (p_decision_kind = 'mixed' and issue_count < 2)
  then
    raise exception 'issue_decision_does_not_match_return_facts'
      using errcode = '23514';
  end if;

  select count(*)::integer into evidence_count
  from public.condition_photos
  where condition_report_id = report.id
    and finalized_at is not null
    and deleted_at is null;
  if (report.has_damage or report.has_missing_items) and evidence_count = 0 then
    raise exception 'return_issue_evidence_required' using errcode = '23514';
  end if;
  if private.net_refund_total(booking.id) <> 0 then
    raise exception 'refunds_must_be_recorded_after_issue_decision'
      using errcode = '23514';
  end if;

  held := private.verified_deposit_held(booking.id);
  if p_deduction_amount > held then
    raise exception 'deduction_exceeds_verified_deposit' using errcode = '23514';
  end if;

  insert into public.return_issue_decisions (
    booking_id,
    condition_report_id,
    decision_kind,
    deduction_amount,
    internal_reason,
    customer_explanation,
    decided_by,
    operation_id
  ) values (
    booking.id,
    report.id,
    p_decision_kind,
    p_deduction_amount,
    btrim(p_internal_reason),
    btrim(p_customer_explanation),
    caller,
    p_operation_id
  ) returning id into decision_id;

  if p_deduction_amount > 0 then
    insert into public.deposit_deductions (
      booking_id,
      issue_decision_id,
      amount,
      reason_snapshot,
      recorded_by,
      operation_id
    ) values (
      booking.id,
      decision_id,
      p_deduction_amount,
      btrim(p_internal_reason),
      caller,
      p_operation_id
    ) returning id into deduction_id;
  end if;

  settlement := private.replace_deposit_settlement(
    booking.id, decision_id, p_operation_id, caller
  );

  perform private.transition_booking(
    booking.id,
    'ISSUE_REVIEW',
    'COMPLETED',
    'admin',
    'issue_review_resolved',
    btrim(p_customer_explanation),
    p_operation_id
  );
  perform private.release_booking_block(booking.id, caller);

  perform private.write_audit(
    p_operation_id,
    'resolve_return_issue',
    'booking',
    booking.id,
    'success',
    'manual issue resolution',
    jsonb_build_object(
      'condition_report_id', report.id,
      'decision_id', decision_id,
      'deduction_id', deduction_id,
      'deduction_amount', p_deduction_amount,
      'deposit_settlement_id', settlement.id,
      'evidence_count', evidence_count,
      'late_return', late_return,
      'amount_is_manual', true
    )
  );

  return jsonb_build_object(
    'decision_id', decision_id,
    'booking_id', booking.id,
    'booking_state', 'COMPLETED',
    'deduction_amount', p_deduction_amount,
    'created', true
  );
end;
$$;
