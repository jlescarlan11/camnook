-- Bind review retries to the immutable decision facts already accepted.
-- Preserve prior null-outcome validation, history, and authorization.
create or replace function private.decide_return_review(
  p_booking_id uuid,
  p_outcome text,
  p_note text,
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
  existing public.booking_state_history%rowtype;
  has_issue boolean;
  late_return boolean;
  evidence_count integer;
  note_id uuid;
  settlement public.deposit_settlements%rowtype;
  target_state public.booking_state;
begin
  if p_booking_id is null
    or p_outcome is null
    or p_outcome not in ('clear', 'issue')
    or p_operation_id is null
    or (
      p_outcome = 'issue'
      and (
        p_note is null
        or length(btrim(p_note)) not between 2 and 2000
        or private.resolution_text_has_forbidden_characters(p_note)
      )
    )
    or (
      p_note is not null
      and nullif(btrim(p_note), '') is not null
      and (
        length(btrim(p_note)) > 2000
        or private.resolution_text_has_forbidden_characters(p_note)
      )
    )
  then
    raise exception 'return_review_decision_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.booking_state_history
  where booking_id = p_booking_id and operation_id = p_operation_id
  order by id desc
  limit 1;
  if existing.to_state in ('ISSUE_REVIEW', 'COMPLETED') then
    if existing.from_state is distinct from 'RETURN_REVIEW'::public.booking_state
      or existing.to_state is distinct from (case when p_outcome = 'clear'
        then 'COMPLETED'::public.booking_state else 'ISSUE_REVIEW'::public.booking_state end)
      or existing.reason_code is distinct from (case when p_outcome = 'clear'
        then 'return_cleared' else 'return_issue_opened' end)
      or existing.actor_user_id is distinct from caller
      or existing.note is distinct from nullif(btrim(p_note), '')
    then
      raise exception 'return_review_retry_changed' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'booking_state', existing.to_state,
      'outcome', case when existing.to_state = 'COMPLETED' then 'clear' else 'issue' end,
      'created', false
    );
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null or booking.state <> 'RETURN_REVIEW' then
    raise exception 'return_review_stale_booking_state' using errcode = '40001';
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
  has_issue := report.has_damage or report.has_missing_items or late_return;
  if (p_outcome = 'issue') <> has_issue then
    raise exception 'return_outcome_must_match_recorded_facts' using errcode = '23514';
  end if;

  select count(*)::integer into evidence_count
  from public.condition_photos
  where condition_report_id = report.id
    and finalized_at is not null
    and deleted_at is null;
  if p_outcome = 'issue'
    and (report.has_damage or report.has_missing_items)
    and evidence_count = 0
  then
    raise exception 'return_issue_evidence_required' using errcode = '23514';
  end if;

  if p_outcome = 'issue' then
    insert into public.return_issue_notes (
      booking_id, condition_report_id, note, created_by, operation_id
    ) values (
      booking.id, report.id, btrim(p_note), caller, p_operation_id
    ) returning id into note_id;
  end if;

  settlement := private.replace_deposit_settlement(
    booking.id, null, p_operation_id, caller
  );
  target_state := case
    when p_outcome = 'clear' then 'COMPLETED'::public.booking_state
    else 'ISSUE_REVIEW'::public.booking_state
  end;

  perform private.transition_booking(
    booking.id,
    'RETURN_REVIEW',
    target_state,
    'admin',
    case when p_outcome = 'clear' then 'return_cleared' else 'return_issue_opened' end,
    nullif(btrim(p_note), ''),
    p_operation_id
  );
  if target_state = 'COMPLETED' then
    perform private.release_booking_block(booking.id, caller);
  end if;

  perform private.write_audit(
    p_operation_id,
    'decide_return_review',
    'booking',
    booking.id,
    'success',
    'return inspection decision',
    jsonb_build_object(
      'resulting_state', target_state,
      'condition_report_id', report.id,
      'issue_note_id', note_id,
      'deposit_settlement_id', settlement.id,
      'evidence_count', evidence_count,
      'late_return', late_return
    )
  );

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', target_state,
    'outcome', p_outcome,
    'created', true
  );
end;
$$;
