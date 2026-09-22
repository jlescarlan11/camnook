-- An omitted list must not be interpreted as explicit removal of every inclusion.
-- Preserve explicit empty lists, archived accessory history, and admin authority.
create or replace function api.save_camera_draft(p_input jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  v_camera_id uuid := nullif(p_input ->> 'id', '')::uuid;
  camera_name text := btrim(p_input ->> 'name');
  camera_description text := btrim(p_input ->> 'description');
  camera_slug text;
  item jsonb;
  position integer := 0;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or camera_name is null or length(camera_name) not between 2 and 160
    or camera_description is null or length(camera_description) not between 2 and 2000
    or (p_input ->> 'daily_rate')::numeric < 0
    or (p_input ->> 'security_deposit')::numeric < 0
    or jsonb_typeof(p_input -> 'accessories') is distinct from 'array'
  then raise exception 'camera_draft_invalid' using errcode = '22023'; end if;

  if v_camera_id is null then
    v_camera_id := gen_random_uuid();
    camera_slug := trim(both '-' from regexp_replace(lower(camera_name), '[^a-z0-9]+', '-', 'g')) || '-' || left(v_camera_id::text, 8);
    insert into public.cameras (
      id, slug, serial_number, name, description, status, daily_rate,
      security_deposit
    ) values (
      v_camera_id, camera_slug, 'draft-' || v_camera_id::text, camera_name,
      camera_description, 'draft', (p_input ->> 'daily_rate')::numeric,
      (p_input ->> 'security_deposit')::numeric
    );
  else
    update public.cameras set
      name = camera_name,
      description = camera_description,
      daily_rate = (p_input ->> 'daily_rate')::numeric,
      security_deposit = (p_input ->> 'security_deposit')::numeric
    where id = v_camera_id and status in ('draft', 'published') and archived_at is null;
    if not found then raise exception 'camera_not_found' using errcode = 'P0002'; end if;
    update public.camera_accessories set archived_at = statement_timestamp()
    where camera_accessories.camera_id = v_camera_id and archived_at is null;
  end if;

  for item in select * from jsonb_array_elements(p_input -> 'accessories') loop
    if length(btrim(item ->> 'name')) not between 1 and 160
      or coalesce((item ->> 'quantity')::integer, 0) < 1
    then raise exception 'camera_accessory_invalid' using errcode = '22023'; end if;
    insert into public.camera_accessories(camera_id, name, quantity, sort_position)
    values (v_camera_id, btrim(item ->> 'name'), (item ->> 'quantity')::integer, position);
    position := position + 1;
  end loop;
  perform caller;
  return v_camera_id;
end;
$$;
