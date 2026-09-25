-- A completed operation only acknowledges the same normalized note and booking.
-- Preserve immutable history, existing authorization, ownership, and grants.
create or replace function private.add_return_issue_note(
  p_booking_id uuid,
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
  report_id uuid;
  existing public.return_issue_notes%rowtype;
  note_id uuid;
begin
  if p_booking_id is null
    or p_operation_id is null
    or p_note is null
    or length(btrim(p_note)) not between 2 and 2000
    or private.resolution_text_has_forbidden_characters(p_note)
  then
    raise exception 'issue_note_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.return_issue_notes
  where operation_id = p_operation_id;
  if existing.id is not null then
    if existing.booking_id is distinct from p_booking_id
      or existing.note is distinct from btrim(p_note)
      or existing.created_by is distinct from caller
    then
      raise exception 'issue_note_retry_changed' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'note_id', existing.id,
      'booking_id', existing.booking_id,
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

  select report.id into report_id
  from public.handoffs as handoff
  join public.condition_reports as report on report.handoff_id = handoff.id
  where handoff.booking_id = booking.id and handoff.type = 'return';
  if report_id is null then
    raise exception 'return_report_not_found' using errcode = 'P0002';
  end if;

  insert into public.return_issue_notes (
    booking_id, condition_report_id, note, created_by, operation_id
  ) values (
    booking.id, report_id, btrim(p_note), caller, p_operation_id
  ) returning id into note_id;

  perform private.write_audit(
    p_operation_id,
    'add_return_issue_note',
    'booking',
    booking.id,
    'success',
    'return issue review',
    jsonb_build_object('note_id', note_id, 'condition_report_id', report_id)
  );

  return jsonb_build_object(
    'note_id', note_id,
    'booking_id', booking.id,
    'created', true
  );
end;
$$;
