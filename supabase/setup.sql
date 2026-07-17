-- Wedding VDO Guest Book — Step 0 setup
-- Paste this whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run: every statement either checks for existence first or replaces
-- its own prior version, so running this twice won't error or duplicate data.

-- ============================================================
-- 1. STORAGE BUCKETS
-- ============================================================

-- clips: guest recordings. PRIVATE — guests can upload but never list/read
-- other guests' clips (ADR-0001). The couple/staff view clips via the
-- Supabase dashboard directly (project owner access bypasses these policies).
insert into storage.buckets (id, name, public)
values ('clips', 'clips', false)
on conflict (id) do nothing;

-- assets: staff-uploaded frame + gesture graphics. PUBLIC READ — every guest
-- phone must be able to fetch these images. Writes are token-gated, see
-- section 4 below.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- ---------- storage RLS policies ----------
-- (row level security is already enabled on storage.objects by default)

drop policy if exists "guests can upload clips" on storage.objects;
create policy "guests can upload clips"
on storage.objects
for insert
to anon
with check (bucket_id = 'clips');
-- deliberately no SELECT/UPDATE/DELETE policy for anon on 'clips' ->
-- guests can insert but never read, list, or overwrite any clip.

drop policy if exists "public can read assets" on storage.objects;
create policy "public can read assets"
on storage.objects
for select
to anon
using (bucket_id = 'assets');
-- write access to 'assets' is token-gated — see section 4 below.


-- ============================================================
-- 2. STAFF SETTINGS TABLE
-- ============================================================
-- Single-row table (id is always 1). Not read by anything yet in Step 1 —
-- the guest page doesn't consult it until the Staff Page exists — but the
-- Step 0 instructions call for the full schema now, done in one pass.

create table if not exists public.staff_settings (
  id                  int primary key default 1 check (id = 1),
  output_width         int not null default 1080,
  output_height        int not null default 1920,
  time_limit_seconds   int not null default 60,
  beauty_smooth        int not null default 60,
  beauty_glow          int not null default 30,
  beauty_vshape        int not null default 0,
  beauty_narrow        int not null default 0,
  frame_url            text,
  gesture_left_url     text,
  gesture_right_url    text,
  passcode             text not null default 'changeme',
  updated_at           timestamptz not null default now()
);

insert into public.staff_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.staff_settings enable row level security;

drop policy if exists "anyone can read settings" on public.staff_settings;
create policy "anyone can read settings"
on public.staff_settings
for select
to anon
using (true);
-- deliberately no INSERT/UPDATE/DELETE policy for anon -> direct writes are
-- blocked. Writes only happen through the passcode-checking function below.


-- ---------- passcode-gated write path ----------
-- Runs as the function owner (bypasses RLS internally) only after verifying
-- p_passcode matches the stored passcode. Threat model per the ADR is "a
-- curious guest", not a real attacker, so this lightweight check is enough
-- for the MVP -- no real auth system needed.

create or replace function public.update_staff_settings(
  p_passcode           text,
  p_output_width       int  default null,
  p_output_height      int  default null,
  p_time_limit_seconds int  default null,
  p_beauty_smooth      int  default null,
  p_beauty_glow        int  default null,
  p_beauty_vshape      int  default null,
  p_beauty_narrow      int  default null,
  p_frame_url          text default null,
  p_gesture_left_url   text default null,
  p_gesture_right_url  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.staff_settings where id = 1 and passcode = p_passcode
  ) then
    raise exception 'invalid passcode';
  end if;

  update public.staff_settings set
    output_width       = coalesce(p_output_width, output_width),
    output_height      = coalesce(p_output_height, output_height),
    time_limit_seconds = coalesce(p_time_limit_seconds, time_limit_seconds),
    beauty_smooth      = coalesce(p_beauty_smooth, beauty_smooth),
    beauty_glow        = coalesce(p_beauty_glow, beauty_glow),
    beauty_vshape      = coalesce(p_beauty_vshape, beauty_vshape),
    beauty_narrow      = coalesce(p_beauty_narrow, beauty_narrow),
    -- asset URLs: null (param omitted) keeps the current value; an empty
    -- string is the explicit "clear this asset" sentinel from the Staff
    -- Page's Remove button; any other value replaces it.
    frame_url          = case when p_frame_url = '' then null else coalesce(p_frame_url, frame_url) end,
    gesture_left_url   = case when p_gesture_left_url = '' then null else coalesce(p_gesture_left_url, gesture_left_url) end,
    gesture_right_url  = case when p_gesture_right_url = '' then null else coalesce(p_gesture_right_url, gesture_right_url) end,
    updated_at         = now()
  where id = 1;
end;
$$;

revoke all on function public.update_staff_settings from public;
grant execute on function public.update_staff_settings to anon;

-- ---------- column-level protection for the passcode ----------
-- The SELECT policy above lets guests read settings, but a blanket table
-- grant would expose the passcode column too. Restrict anon to exactly
-- the columns the guest page needs.

revoke select on public.staff_settings from anon;
grant select (
  id, output_width, output_height, time_limit_seconds,
  beauty_smooth, beauty_glow, beauty_vshape, beauty_narrow,
  frame_url, gesture_left_url, gesture_right_url, updated_at
) on public.staff_settings to anon;


-- ============================================================
-- 3. CLIP RECORDS
-- ============================================================
-- One row per uploaded clip: the guest's name EXACTLY as typed
-- (Thai/emoji intact) plus the storage path, since storage filenames
-- must be sanitized to ASCII. Insert-only for guests, same as the
-- storage bucket: no guest can list who else recorded what.

create table if not exists public.clips (
  id           uuid primary key default gen_random_uuid(),
  guest_name   text not null,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table public.clips enable row level security;

drop policy if exists "guests can add clip records" on public.clips;
create policy "guests can add clip records"
on public.clips
for insert
to anon
with check (true);
-- deliberately no SELECT/UPDATE/DELETE for anon.

-- ============================================================
-- 4. UPLOAD TOKENS (staff asset uploads — issue #9)
-- ============================================================
-- The Staff Page needs to write to the 'assets' bucket (frame + two
-- gesture graphics), but storage RLS policies can't check a passcode
-- per request the way update_staff_settings does for the settings
-- table. Instead: a passcode-checked RPC mints a short-lived token;
-- the storage write policies below just require ANY unexpired token
-- to exist. Deliberately not scoped to a specific upload path/session
-- — simpler to reason about, and matches ADR-0003's threat model
-- ("curious guest", not an attacker) — see that ADR for alternatives
-- considered.

create table if not exists public.upload_tokens (
  token      text primary key default encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table public.upload_tokens enable row level security;

drop policy if exists "anyone can check token validity" on public.upload_tokens;
create policy "anyone can check token validity"
on public.upload_tokens
for select
to anon
using (true);
-- deliberately readable: the assets storage policies below run this
-- exact SELECT as the uploading (anon) role. No INSERT/UPDATE/DELETE
-- policy for anon -> only mint_upload_token (security definer) below
-- ever creates a row.

grant select on public.upload_tokens to anon;

create or replace function public.mint_upload_token(p_passcode text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from public.staff_settings where id = 1 and passcode = p_passcode
  ) then
    raise exception 'invalid passcode';
  end if;

  delete from public.upload_tokens where expires_at < now();

  insert into public.upload_tokens default values
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.mint_upload_token from public;
grant execute on function public.mint_upload_token to anon;

drop policy if exists "valid token holders can upload assets" on storage.objects;
create policy "valid token holders can upload assets"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'assets'
  and exists (select 1 from public.upload_tokens where expires_at > now())
);

drop policy if exists "valid token holders can overwrite assets" on storage.objects;
create policy "valid token holders can overwrite assets"
on storage.objects
for update
to anon
using (bucket_id = 'assets')
with check (
  bucket_id = 'assets'
  and exists (select 1 from public.upload_tokens where expires_at > now())
);

-- ============================================================
-- Done. Expected result: "Success. No rows returned" in the SQL Editor.
-- ============================================================
