-- A stable client creation reference is the new place ID. The existing global
-- transaction lock serializes retries without changing saved booking snapshots.
create or replace function api.save_meetup_place(p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  place_id uuid := coalesce(nullif(p_input->>'id','')::uuid,
    nullif(p_input->>'creation_id','')::uuid, gen_random_uuid());
  expected bigint := (p_input->>'version')::bigint;
  existing public.meetup_places%rowtype;
begin
  if not private.is_admin() then
    raise exception 'admin authorization required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('camnook_meetup_places',0));
  if nullif(p_input->>'id','') is null then
    select * into existing from public.meetup_places where id = place_id;
    if found then
      -- Never overwrite an edit or resurrect an archived place during retry.
      if existing.version <> 1 or existing.archived_at is not null
        or existing.created_by is distinct from auth.uid()
        or existing.name is distinct from btrim(p_input->>'name')
        or existing.address is distinct from btrim(p_input->>'address')
        or existing.city is distinct from btrim(p_input->>'city')
        or existing.latitude is distinct from (p_input->>'latitude')::numeric(9,6)
        or existing.longitude is distinct from (p_input->>'longitude')::numeric(10,6)
        or existing.arrival_instructions is distinct from coalesce(p_input->>'arrival_instructions','')
        or existing.source is distinct from p_input->>'source'
        or existing.attribution is distinct from p_input->>'attribution'
      then raise exception 'meetup_changed'; end if;
      return place_id;
    end if;
    insert into public.meetup_places(
      id,name,address,city,latitude,longitude,arrival_instructions,
      source,attribution,created_by,updated_by
    ) values (
      place_id,btrim(p_input->>'name'),btrim(p_input->>'address'),
      btrim(p_input->>'city'),(p_input->>'latitude')::numeric,
      (p_input->>'longitude')::numeric,coalesce(p_input->>'arrival_instructions',''),
      p_input->>'source',p_input->>'attribution',auth.uid(),auth.uid()
    );
  else
    update public.meetup_places set
      name=btrim(p_input->>'name'), address=btrim(p_input->>'address'),
      city=btrim(p_input->>'city'), latitude=(p_input->>'latitude')::numeric,
      longitude=(p_input->>'longitude')::numeric,
      arrival_instructions=coalesce(p_input->>'arrival_instructions',''),
      source=p_input->>'source', attribution=p_input->>'attribution',
      version=version+1, updated_at=now(), updated_by=auth.uid()
    where id=place_id and version=expected and archived_at is null;
    if not found then raise exception 'meetup_changed'; end if;
  end if;
  return place_id;
end;
$$;
