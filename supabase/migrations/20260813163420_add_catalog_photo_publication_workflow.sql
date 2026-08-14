-- Audited, retry-safe camera listing photo publication without a service key.
-- An explicitly authorized application admin uploads to private staging with a
-- short-lived user access token. The operator verifies the bytes, copies them
-- through the Storage API, verifies the destination, and commits the public
-- camera_photos reference through narrow API functions. No service key is used.

create type private.catalog_photo_publication_status as enum (
  'awaiting_upload',
  'ready_to_copy',
  'published',
  'abort_pending',
  'aborted',
  'archive_pending',
  'archived'
);

create table private.catalog_photo_publications (
  id uuid primary key,
  camera_id uuid not null references public.cameras (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  staging_object_path text not null unique
    check (staging_object_path !~ '[[:space:]]'),
  public_object_path text not null unique
    check (public_object_path !~ '[[:space:]]'),
  alt_text text not null check (length(btrim(alt_text)) between 2 and 240),
  sort_position integer not null check (sort_position >= 0),
  expected_media_type text not null
    check (expected_media_type in ('image/jpeg', 'image/png', 'image/webp')),
  expected_byte_size bigint not null
    check (expected_byte_size between 1 and 10485760),
  expected_sha256 bytea not null check (octet_length(expected_sha256) = 32),
  status private.catalog_photo_publication_status not null default 'awaiting_upload',
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '30 minutes',
  source_verified_at timestamptz,
  destination_verified_at timestamptz,
  staging_removed_at timestamptz,
  abort_requested_at timestamptz,
  aborted_at timestamptz,
  archive_requested_at timestamptz,
  archived_at timestamptz,
  check (expires_at > created_at),
  check (status <> 'ready_to_copy' or source_verified_at is not null),
  check (status <> 'published' or destination_verified_at is not null),
  check (status <> 'aborted' or aborted_at is not null),
  check (status <> 'archived' or archived_at is not null)
);

create unique index catalog_photo_publications_active_position_idx
on private.catalog_photo_publications (camera_id, sort_position)
where status in (
  'awaiting_upload',
  'ready_to_copy',
  'published',
  'abort_pending',
  'archive_pending'
);

create index catalog_photo_publications_camera_id_idx
on private.catalog_photo_publications (camera_id);

create index catalog_photo_publications_created_by_idx
on private.catalog_photo_publications (created_by);

alter table private.catalog_photo_publications enable row level security;

create function private.catalog_photo_extension(p_media_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_media_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else null
  end;
$$;

create function private.catalog_photo_publication_json(
  p_publication private.catalog_photo_publications
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_publication.id,
    'camera_id', p_publication.camera_id,
    'staging_object_path', p_publication.staging_object_path,
    'public_object_path', p_publication.public_object_path,
    'expected_media_type', p_publication.expected_media_type,
    'expected_byte_size', p_publication.expected_byte_size,
    'expected_sha256', encode(p_publication.expected_sha256, 'hex'),
    'expires_at', p_publication.expires_at,
    'status', p_publication.status
  );
$$;

create function private.create_catalog_photo_publication(
  p_publication_id uuid,
  p_camera_id uuid,
  p_alt_text text,
  p_sort_position integer,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
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
  existing private.catalog_photo_publications%rowtype;
  target_camera public.cameras%rowtype;
  extension text := private.catalog_photo_extension(p_media_type);
  normalized_alt_text text := btrim(p_alt_text);
  expected_hash bytea;
  staging_path text;
  destination_path text;
begin
  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;
  if extension is null then
    raise exception 'unsupported catalog photo media type'
      using errcode = '22023';
  end if;
  if length(normalized_alt_text) not between 2 and 240 then
    raise exception 'catalog photo alt text is invalid'
      using errcode = '22023';
  end if;
  if p_sort_position is null or p_sort_position < 0 then
    raise exception 'catalog photo sort position is invalid'
      using errcode = '22023';
  end if;
  if p_byte_size is null or p_byte_size not between 1 and 10485760 then
    raise exception 'catalog photo byte size is invalid'
      using errcode = '22023';
  end if;
  if p_sha256_hex is null or p_sha256_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'catalog photo digest is invalid'
      using errcode = '22023';
  end if;

  expected_hash := decode(p_sha256_hex, 'hex');
  staging_path := format(
    'camera-listings/%s/%s.%s',
    p_camera_id,
    p_publication_id,
    extension
  );
  destination_path := format(
    '%s/%s.%s',
    p_camera_id,
    p_publication_id,
    extension
  );

  select * into existing
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if existing.id is not null then
    if existing.camera_id is distinct from p_camera_id
      or existing.created_by is distinct from caller
      or existing.alt_text is distinct from normalized_alt_text
      or existing.sort_position is distinct from p_sort_position
      or existing.expected_media_type is distinct from p_media_type
      or existing.expected_byte_size is distinct from p_byte_size
      or existing.expected_sha256 is distinct from expected_hash
    then
      raise exception 'publication reference conflicts with an existing request'
        using errcode = '23505';
    end if;

    return private.catalog_photo_publication_json(existing);
  end if;

  select * into target_camera
  from public.cameras
  where id = p_camera_id
  for update;

  if target_camera.id is null then
    raise exception 'draft camera not found' using errcode = 'P0002';
  end if;
  if target_camera.status <> 'draft' then
    raise exception 'catalog photos can be prepared only for draft cameras'
      using errcode = '22023';
  end if;

  insert into private.catalog_photo_publications (
    id,
    camera_id,
    created_by,
    staging_object_path,
    public_object_path,
    alt_text,
    sort_position,
    expected_media_type,
    expected_byte_size,
    expected_sha256
  ) values (
    p_publication_id,
    p_camera_id,
    caller,
    staging_path,
    destination_path,
    normalized_alt_text,
    p_sort_position,
    p_media_type,
    p_byte_size,
    expected_hash
  )
  returning * into existing;

  perform private.write_audit(
    p_operation_id,
    'create_catalog_photo_publication',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo staging',
    jsonb_build_object(
      'camera_id', p_camera_id,
      'sort_position', p_sort_position,
      'media_type', p_media_type,
      'byte_size', p_byte_size
    )
  );

  return private.catalog_photo_publication_json(existing);
end;
$$;

create function private.get_catalog_photo_publication(p_publication_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
begin
  perform private.require_admin();

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.list_catalog_photo_publications()
returns table (
  id uuid,
  camera_id uuid,
  camera_name text,
  alt_text text,
  sort_position integer,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    publication.id,
    publication.camera_id,
    camera.name,
    publication.alt_text,
    publication.sort_position,
    publication.status::text,
    publication.created_at,
    publication.expires_at
  from private.catalog_photo_publications as publication
  join public.cameras as camera on camera.id = publication.camera_id
  where publication.status not in ('aborted', 'archived')
  order by publication.created_at desc, publication.id;
end;
$$;

create function private.mark_catalog_photo_ready(
  p_publication_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
begin
  perform private.require_admin();

  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;
  if p_verified_sha256_hex is null
    or p_verified_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'staged catalog photo digest is invalid'
      using errcode = '22023';
  end if;
  if p_verified_media_type is distinct from target.expected_media_type
    or p_verified_byte_size is distinct from target.expected_byte_size
    or decode(p_verified_sha256_hex, 'hex') is distinct from target.expected_sha256
  then
    raise exception 'staged catalog photo does not match its approved bytes'
      using errcode = '23514';
  end if;
  if target.status in ('ready_to_copy', 'published') then
    return private.catalog_photo_publication_json(target);
  end if;
  if target.status <> 'awaiting_upload' then
    raise exception 'catalog photo publication cannot be prepared from its current state'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'draft-staging'
      and object.name = target.staging_object_path
      and object.created_at <= target.expires_at
  ) then
    raise exception 'staged catalog photo object is missing or was uploaded after intent expiry'
      using errcode = 'P0002';
  end if;

  update private.catalog_photo_publications
  set status = 'ready_to_copy',
      source_verified_at = statement_timestamp()
  where id = p_publication_id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'verify_catalog_photo_staging',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo publication',
    jsonb_build_object('camera_id', target.camera_id)
  );

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.finalize_catalog_photo_publication(
  p_publication_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
  target_camera public.cameras%rowtype;
  existing_photo public.camera_photos%rowtype;
begin
  perform private.require_admin();

  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;

  select * into target_camera
  from public.cameras
  where id = target.camera_id
  for update;

  if target_camera.id is null then
    raise exception 'catalog photo camera not found' using errcode = 'P0002';
  end if;
  if target.status <> 'published' and target_camera.status <> 'draft' then
    raise exception 'catalog photo camera is no longer a draft'
      using errcode = '22023';
  end if;

  select * into existing_photo
  from public.camera_photos
  where id = p_publication_id;

  if p_verified_sha256_hex is null
    or p_verified_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'public catalog photo digest is invalid'
      using errcode = '22023';
  end if;
  if p_verified_media_type is distinct from target.expected_media_type
    or p_verified_byte_size is distinct from target.expected_byte_size
    or decode(p_verified_sha256_hex, 'hex') is distinct from target.expected_sha256
  then
    raise exception 'public catalog photo does not match its approved bytes'
      using errcode = '23514';
  end if;

  if target.status = 'published' then
    if existing_photo.id is null
      or existing_photo.camera_id is distinct from target.camera_id
      or existing_photo.object_path is distinct from target.public_object_path
      or existing_photo.alt_text is distinct from target.alt_text
      or existing_photo.sort_position is distinct from target.sort_position
      or existing_photo.archived_at is not null
    then
      raise exception 'published catalog photo metadata is inconsistent'
        using errcode = '23514';
    end if;

    return private.catalog_photo_publication_json(target);
  end if;

  if target.status <> 'ready_to_copy' then
    raise exception 'catalog photo publication is not ready to finalize'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'camera-listings'
      and object.name = target.public_object_path
  ) then
    raise exception 'public catalog photo object is missing'
      using errcode = 'P0002';
  end if;

  if existing_photo.id is null then
    insert into public.camera_photos (
      id,
      camera_id,
      object_path,
      alt_text,
      sort_position
    ) values (
      target.id,
      target.camera_id,
      target.public_object_path,
      target.alt_text,
      target.sort_position
    );
  elsif existing_photo.camera_id is distinct from target.camera_id
    or existing_photo.object_path is distinct from target.public_object_path
    or existing_photo.alt_text is distinct from target.alt_text
    or existing_photo.sort_position is distinct from target.sort_position
    or existing_photo.archived_at is not null
  then
    raise exception 'catalog photo metadata conflicts with the publication request'
      using errcode = '23514';
  end if;

  update private.catalog_photo_publications
  set status = 'published',
      destination_verified_at = statement_timestamp()
  where id = p_publication_id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'finalize_catalog_photo_publication',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo publication',
    jsonb_build_object('camera_id', target.camera_id)
  );

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.confirm_catalog_photo_staging_removed(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
begin
  perform private.require_admin();

  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;
  if target.status <> 'published' then
    raise exception 'catalog photo publication is not published'
      using errcode = '22023';
  end if;
  if target.staging_removed_at is not null then
    return private.catalog_photo_publication_json(target);
  end if;
  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'draft-staging'
      and object.name = target.staging_object_path
  ) then
    raise exception 'staged catalog photo still exists'
      using errcode = '23514';
  end if;

  update private.catalog_photo_publications
  set staging_removed_at = statement_timestamp()
  where id = p_publication_id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'confirm_catalog_photo_staging_removed',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo publication cleanup',
    jsonb_build_object('camera_id', target.camera_id)
  );

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.publish_camera(
  p_camera_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target public.cameras%rowtype;
begin
  perform private.require_admin();

  if p_camera_id is null or p_operation_id is null then
    raise exception 'camera and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from public.cameras
  where id = p_camera_id
  for update;

  if target.id is null then
    raise exception 'camera not found' using errcode = 'P0002';
  end if;
  if target.status not in ('draft', 'published') then
    raise exception 'only a draft camera can be published'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.camera_photos as photo
    join private.catalog_photo_publications as publication
      on publication.id = photo.id
     and publication.camera_id = photo.camera_id
     and publication.public_object_path = photo.object_path
     and publication.status = 'published'
    join storage.objects as object
      on object.bucket_id = 'camera-listings'
     and object.name = photo.object_path
    where photo.camera_id = target.id
      and photo.archived_at is null
  ) then
    raise exception 'camera publication requires an active verified listing photo'
      using errcode = '23514';
  end if;

  if target.status = 'published' then
    return jsonb_build_object(
      'id', target.id,
      'status', target.status,
      'published_at', target.published_at
    );
  end if;

  update public.cameras
  set status = 'published',
      published_at = statement_timestamp()
  where id = target.id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'publish_camera',
    'camera',
    target.id,
    'success',
    'catalog publication',
    jsonb_build_object('camera_id', target.id)
  );

  return jsonb_build_object(
    'id', target.id,
    'status', target.status,
    'published_at', target.published_at
  );
end;
$$;

create function private.prepare_catalog_photo_abort(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
begin
  perform private.require_admin();

  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;
  if target.status = 'abort_pending' then
    return private.catalog_photo_publication_json(target);
  end if;
  if target.status not in ('awaiting_upload', 'ready_to_copy') then
    raise exception 'catalog photo publication cannot be aborted from its current state'
      using errcode = '22023';
  end if;

  update private.catalog_photo_publications
  set status = 'abort_pending',
      abort_requested_at = statement_timestamp()
  where id = p_publication_id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'prepare_catalog_photo_abort',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo publication recovery',
    jsonb_build_object('camera_id', target.camera_id)
  );

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.finalize_catalog_photo_abort(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
begin
  perform private.require_admin();

  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;
  if target.status = 'aborted' then
    return private.catalog_photo_publication_json(target);
  end if;
  if target.status <> 'abort_pending' then
    raise exception 'catalog photo publication is not awaiting abort cleanup'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from storage.objects as object
    where (object.bucket_id = 'draft-staging'
      and object.name = target.staging_object_path)
      or (object.bucket_id = 'camera-listings'
        and object.name = target.public_object_path)
  ) then
    raise exception 'catalog photo publication objects still exist'
      using errcode = '23514';
  end if;

  update private.catalog_photo_publications
  set status = 'aborted',
      aborted_at = statement_timestamp()
  where id = p_publication_id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'finalize_catalog_photo_abort',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo publication recovery',
    jsonb_build_object('camera_id', target.camera_id)
  );

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.prepare_catalog_photo_archive(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
  target_camera public.cameras%rowtype;
  archived_time timestamptz := statement_timestamp();
begin
  perform private.require_admin();

  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;

  select * into target_camera
  from public.cameras
  where id = target.camera_id
  for update;

  if target_camera.id is null then
    raise exception 'catalog photo camera not found' using errcode = 'P0002';
  end if;
  if target.status = 'archive_pending' then
    return private.catalog_photo_publication_json(target);
  end if;
  if target.status <> 'published' then
    raise exception 'catalog photo publication cannot be archived from its current state'
      using errcode = '22023';
  end if;
  if target_camera.status = 'published' and not exists (
    select 1
    from public.camera_photos as photo
    where photo.camera_id = target.camera_id
      and photo.id <> target.id
      and photo.archived_at is null
  ) then
    raise exception 'a published camera must retain at least one active photo'
      using errcode = '23514';
  end if;

  update public.camera_photos
  set archived_at = archived_time
  where id = target.id
    and camera_id = target.camera_id
    and object_path = target.public_object_path
    and archived_at is null;

  if not found then
    raise exception 'active catalog photo metadata is missing or inconsistent'
      using errcode = '23514';
  end if;

  update private.catalog_photo_publications
  set status = 'archive_pending',
      archive_requested_at = archived_time
  where id = p_publication_id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'prepare_catalog_photo_archive',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo archive',
    jsonb_build_object('camera_id', target.camera_id)
  );

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.finalize_catalog_photo_archive(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.catalog_photo_publications%rowtype;
begin
  perform private.require_admin();

  if p_publication_id is null or p_operation_id is null then
    raise exception 'publication and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from private.catalog_photo_publications
  where id = p_publication_id
  for update;

  if target.id is null then
    raise exception 'catalog photo publication not found' using errcode = 'P0002';
  end if;
  if target.status = 'archived' then
    return private.catalog_photo_publication_json(target);
  end if;
  if target.status <> 'archive_pending' then
    raise exception 'catalog photo publication is not awaiting archive cleanup'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from storage.objects as object
    where (object.bucket_id = 'draft-staging'
      and object.name = target.staging_object_path)
      or (object.bucket_id = 'camera-listings'
        and object.name = target.public_object_path)
  ) then
    raise exception 'catalog photo publication objects still exist'
      using errcode = '23514';
  end if;

  update private.catalog_photo_publications
  set status = 'archived',
      archived_at = statement_timestamp(),
      staging_removed_at = coalesce(staging_removed_at, statement_timestamp())
  where id = p_publication_id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'finalize_catalog_photo_archive',
    'catalog_photo_publication',
    p_publication_id,
    'success',
    'catalog photo archive',
    jsonb_build_object('camera_id', target.camera_id)
  );

  return private.catalog_photo_publication_json(target);
end;
$$;

create function private.can_insert_catalog_photo_staging(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.catalog_photo_publications as publication
      where publication.staging_object_path = p_name
        and publication.created_by = auth.uid()
        and publication.status = 'awaiting_upload'
        and statement_timestamp() < publication.expires_at
    );
$$;

create function private.can_select_catalog_photo_staging(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.catalog_photo_publications as publication
      where publication.staging_object_path = p_name
        and publication.status in (
          'awaiting_upload',
          'ready_to_copy',
          'published',
          'abort_pending',
          'archive_pending'
        )
    );
$$;

create function private.can_delete_catalog_photo_staging(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.catalog_photo_publications as publication
      where publication.staging_object_path = p_name
        and publication.status in (
          'published',
          'abort_pending',
          'archive_pending'
        )
    );
$$;

create function private.can_insert_catalog_photo_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.catalog_photo_publications as publication
      where publication.public_object_path = p_name
        and publication.status = 'ready_to_copy'
    );
$$;

create function private.can_select_catalog_photo_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.catalog_photo_publications as publication
      where publication.public_object_path = p_name
        and publication.status in (
          'ready_to_copy',
          'published',
          'abort_pending',
          'archive_pending'
        )
    );
$$;

create function private.can_delete_catalog_photo_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.catalog_photo_publications as publication
      where publication.public_object_path = p_name
        and publication.status in ('abort_pending', 'archive_pending')
    );
$$;

drop policy if exists camera_listing_objects_admin_insert
on storage.objects;

drop policy if exists camera_listing_objects_public_read
on storage.objects;

create policy camera_listing_objects_public_read
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'camera-listings'
  and exists (
    select 1
    from public.camera_photos as photo
    join public.cameras as camera on camera.id = photo.camera_id
    where photo.object_path = name
      and photo.archived_at is null
      and camera.status = 'published'
  )
);

create policy camera_listing_objects_publication_select
on storage.objects for select to authenticated
using (
  bucket_id = 'camera-listings'
  and (select private.can_select_catalog_photo_public(name))
);

create policy catalog_photo_staging_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'draft-staging'
  and (select private.can_insert_catalog_photo_staging(name))
);

create policy catalog_photo_staging_select
on storage.objects for select to authenticated
using (
  bucket_id = 'draft-staging'
  and (select private.can_select_catalog_photo_staging(name))
);

create policy catalog_photo_staging_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'draft-staging'
  and (select private.can_delete_catalog_photo_staging(name))
);

create policy camera_listing_objects_publication_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'camera-listings'
  and (select private.can_insert_catalog_photo_public(name))
);

create policy camera_listing_objects_publication_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'camera-listings'
  and (select private.can_delete_catalog_photo_public(name))
);

create function api.create_catalog_photo_publication(
  p_publication_id uuid,
  p_camera_id uuid,
  p_alt_text text,
  p_sort_position integer,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_catalog_photo_publication(
    p_publication_id,
    p_camera_id,
    p_alt_text,
    p_sort_position,
    p_media_type,
    p_byte_size,
    p_sha256_hex,
    p_operation_id
  );
$$;

create function api.get_catalog_photo_publication(p_publication_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_catalog_photo_publication(p_publication_id);
$$;

create function api.list_catalog_photo_publications()
returns table (
  id uuid,
  camera_id uuid,
  camera_name text,
  alt_text text,
  sort_position integer,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_catalog_photo_publications();
$$;

create function api.mark_catalog_photo_ready(
  p_publication_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.mark_catalog_photo_ready(
    p_publication_id,
    p_verified_media_type,
    p_verified_byte_size,
    p_verified_sha256_hex,
    p_operation_id
  );
$$;

create function api.finalize_catalog_photo_publication(
  p_publication_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_catalog_photo_publication(
    p_publication_id,
    p_verified_media_type,
    p_verified_byte_size,
    p_verified_sha256_hex,
    p_operation_id
  );
$$;

create function api.confirm_catalog_photo_staging_removed(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.confirm_catalog_photo_staging_removed(
    p_publication_id,
    p_operation_id
  );
$$;

create function api.publish_camera(
  p_camera_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.publish_camera(p_camera_id, p_operation_id);
$$;

create function api.prepare_catalog_photo_abort(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.prepare_catalog_photo_abort(p_publication_id, p_operation_id);
$$;

create function api.finalize_catalog_photo_abort(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_catalog_photo_abort(p_publication_id, p_operation_id);
$$;

create function api.prepare_catalog_photo_archive(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.prepare_catalog_photo_archive(p_publication_id, p_operation_id);
$$;

create function api.finalize_catalog_photo_archive(
  p_publication_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_catalog_photo_archive(p_publication_id, p_operation_id);
$$;

revoke all on table private.catalog_photo_publications
from public, anon, authenticated;

revoke all on function private.catalog_photo_extension(text)
from public, anon, authenticated;
revoke all on function private.catalog_photo_publication_json(
  private.catalog_photo_publications
)
from public, anon, authenticated;
revoke all on function private.create_catalog_photo_publication(
  uuid, uuid, text, integer, text, bigint, text, uuid
)
from public, anon, authenticated;
revoke all on function private.get_catalog_photo_publication(uuid)
from public, anon, authenticated;
revoke all on function private.list_catalog_photo_publications()
from public, anon, authenticated;
revoke all on function private.mark_catalog_photo_ready(
  uuid, text, bigint, text, uuid
)
from public, anon, authenticated;
revoke all on function private.finalize_catalog_photo_publication(
  uuid, text, bigint, text, uuid
)
from public, anon, authenticated;
revoke all on function private.confirm_catalog_photo_staging_removed(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.publish_camera(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.prepare_catalog_photo_abort(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.finalize_catalog_photo_abort(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.prepare_catalog_photo_archive(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.finalize_catalog_photo_archive(uuid, uuid)
from public, anon, authenticated;

-- API wrappers are security invokers. The private functions retain the real
-- authorization boundary through private.require_admin(), matching the
-- repository's existing narrow-RPC pattern.
grant execute on function private.create_catalog_photo_publication(
  uuid, uuid, text, integer, text, bigint, text, uuid
)
to authenticated;
grant execute on function private.get_catalog_photo_publication(uuid)
to authenticated;
grant execute on function private.list_catalog_photo_publications()
to authenticated;
grant execute on function private.mark_catalog_photo_ready(
  uuid, text, bigint, text, uuid
)
to authenticated;
grant execute on function private.finalize_catalog_photo_publication(
  uuid, text, bigint, text, uuid
)
to authenticated;
grant execute on function private.confirm_catalog_photo_staging_removed(uuid, uuid)
to authenticated;
grant execute on function private.publish_camera(uuid, uuid)
to authenticated;
grant execute on function private.prepare_catalog_photo_abort(uuid, uuid)
to authenticated;
grant execute on function private.finalize_catalog_photo_abort(uuid, uuid)
to authenticated;
grant execute on function private.prepare_catalog_photo_archive(uuid, uuid)
to authenticated;
grant execute on function private.finalize_catalog_photo_archive(uuid, uuid)
to authenticated;

revoke all on function private.can_insert_catalog_photo_staging(text)
from public, anon, authenticated;
revoke all on function private.can_select_catalog_photo_staging(text)
from public, anon, authenticated;
revoke all on function private.can_delete_catalog_photo_staging(text)
from public, anon, authenticated;
revoke all on function private.can_insert_catalog_photo_public(text)
from public, anon, authenticated;
revoke all on function private.can_select_catalog_photo_public(text)
from public, anon, authenticated;
revoke all on function private.can_delete_catalog_photo_public(text)
from public, anon, authenticated;

grant execute on function private.can_insert_catalog_photo_staging(text)
to authenticated;
grant execute on function private.can_select_catalog_photo_staging(text)
to authenticated;
grant execute on function private.can_delete_catalog_photo_staging(text)
to authenticated;
grant execute on function private.can_insert_catalog_photo_public(text)
to authenticated;
grant execute on function private.can_select_catalog_photo_public(text)
to authenticated;
grant execute on function private.can_delete_catalog_photo_public(text)
to authenticated;

revoke all on function api.create_catalog_photo_publication(
  uuid, uuid, text, integer, text, bigint, text, uuid
)
from public, anon, authenticated;
revoke all on function api.get_catalog_photo_publication(uuid)
from public, anon, authenticated;
revoke all on function api.list_catalog_photo_publications()
from public, anon, authenticated;
revoke all on function api.mark_catalog_photo_ready(
  uuid, text, bigint, text, uuid
)
from public, anon, authenticated;
revoke all on function api.finalize_catalog_photo_publication(
  uuid, text, bigint, text, uuid
)
from public, anon, authenticated;
revoke all on function api.confirm_catalog_photo_staging_removed(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.publish_camera(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.prepare_catalog_photo_abort(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.finalize_catalog_photo_abort(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.prepare_catalog_photo_archive(uuid, uuid)
from public, anon, authenticated;
revoke all on function api.finalize_catalog_photo_archive(uuid, uuid)
from public, anon, authenticated;

grant execute on function api.create_catalog_photo_publication(
  uuid, uuid, text, integer, text, bigint, text, uuid
)
to authenticated;
grant execute on function api.get_catalog_photo_publication(uuid)
to authenticated;
grant execute on function api.list_catalog_photo_publications()
to authenticated;
grant execute on function api.mark_catalog_photo_ready(
  uuid, text, bigint, text, uuid
)
to authenticated;
grant execute on function api.finalize_catalog_photo_publication(
  uuid, text, bigint, text, uuid
)
to authenticated;
grant execute on function api.confirm_catalog_photo_staging_removed(uuid, uuid)
to authenticated;
grant execute on function api.publish_camera(uuid, uuid)
to authenticated;
grant execute on function api.prepare_catalog_photo_abort(uuid, uuid)
to authenticated;
grant execute on function api.finalize_catalog_photo_abort(uuid, uuid)
to authenticated;
grant execute on function api.prepare_catalog_photo_archive(uuid, uuid)
to authenticated;
grant execute on function api.finalize_catalog_photo_archive(uuid, uuid)
to authenticated;
