-- =====================================================================
-- Art Class Gallery — database setup (version 2)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
--
-- It can be run again at any time, but running it RESETS the app:
-- all logins, children, photo records and lesson notes are removed.
-- (After running it, create the admin again at  …/#setup )
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Clear any earlier version
-- ---------------------------------------------------------------------
drop policy if exists "staff upload photo files" on storage.objects;
drop policy if exists "see allowed photo files" on storage.objects;
drop policy if exists "staff delete photo files" on storage.objects;

drop table if exists public.photo_students cascade;
drop table if exists public.photos cascade;
drop table if exists public.lessons cascade;
drop table if exists public.level_history cascade;
drop table if exists public.students cascade;
drop table if exists public.auth_secrets cascade;
drop table if exists public.profiles cascade;

drop function if exists public.my_role() cascade;
drop function if exists public.is_staff() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_active_user() cascade;
drop function if exists public.can_see_student(uuid) cascade;
drop function if exists public.can_see_photo(uuid) cascade;
drop function if exists public.can_see_photo_file(text) cascade;
drop function if exists public.can_manage_photo(uuid) cascade;
drop function if exists public.set_level(uuid, text) cascade;
drop function if exists public.log_level_change() cascade;
drop function if exists public.revoke_sessions(uuid) cascade;

-- ---------------------------------------------------------------------
-- 1. Logins
-- role = 'admin' | 'teacher' | 'parent'
-- One parent login can cover several children (siblings).
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  login_id      text unique not null,            -- e.g. TIFFANY
  role          text not null check (role in ('admin','teacher','parent')),
  display_name  text not null,                   -- e.g. Tiffany Lim
  secret_set    boolean not null default false,  -- has chosen their own PIN / password
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Login secrets: ONLY the server function can read this table.
create table public.auth_secrets (
  id              uuid primary key references public.profiles(id) on delete cascade,
  otc_hash        text,
  otc_expires_at  timestamptz,
  failed_attempts int not null default 0,
  locked_until    timestamptz
);

-- ---------------------------------------------------------------------
-- 2. Children
-- ---------------------------------------------------------------------
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references public.profiles(id) on delete cascade,
  full_name   text not null,
  consent     boolean not null default false,   -- parent agreed to photos
  notes       text,
  created_at  timestamptz not null default now()
);
create index students_parent_idx on public.students(parent_id);

-- ---------------------------------------------------------------------
-- 3. Lessons (one description per date) and photos
-- ---------------------------------------------------------------------
create table public.lessons (
  taken_on    date primary key,
  note        text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  path         text not null unique,
  thumb_path   text not null unique,
  taken_on     date not null,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index photos_taken_on_idx on public.photos(taken_on desc);

create table public.photo_students (
  photo_id    uuid not null references public.photos(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  primary key (photo_id, student_id)
);
create index photo_students_student_idx on public.photo_students(student_id);

-- ---------------------------------------------------------------------
-- 4. Helper checks used by the security rules
-- ---------------------------------------------------------------------
create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() is not null
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','teacher'), false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Teachers and admin: every child. Parents: only their own children.
create function public.can_see_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or (public.my_role() = 'parent'
          and exists (select 1 from students s where s.id = sid and s.parent_id = auth.uid()))
$$;

create function public.can_see_photo(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from photo_students ps
                 where ps.photo_id = pid and public.can_see_student(ps.student_id))
$$;

create function public.can_see_photo_file(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos ph
    where (ph.path = obj or ph.thumb_path = obj) and public.can_see_photo(ph.id)
  )
$$;

create function public.can_manage_photo(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos ph
    where ph.id = pid and (public.is_admin() or (public.is_staff() and ph.uploaded_by = auth.uid()))
  )
$$;

-- Used by the server function when a login is reset: signs out every device.
create function public.revoke_sessions(uid uuid) returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where user_id = uid;
$$;
revoke execute on function public.revoke_sessions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Security rules (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.auth_secrets   enable row level security;
alter table public.students       enable row level security;
alter table public.lessons        enable row level security;
alter table public.photos         enable row level security;
alter table public.photo_students enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.students, public.lessons,
  public.photos, public.photo_students to authenticated;
revoke all on public.auth_secrets from anon, authenticated;
revoke all on public.profiles, public.students, public.lessons,
  public.photos, public.photo_students from anon;
grant all on public.profiles, public.auth_secrets, public.students, public.lessons,
  public.photos, public.photo_students to service_role;

-- logins
create policy "see own login, admin sees all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin edits logins" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- children
create policy "see allowed children" on public.students
  for select to authenticated using (public.can_see_student(id));
create policy "admin adds children" on public.students
  for insert to authenticated with check (public.is_admin());
create policy "admin edits children" on public.students
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- lesson notes: everyone logged in can read, teachers write
create policy "read lesson notes" on public.lessons
  for select to authenticated using (public.is_active_user());
create policy "staff add lesson notes" on public.lessons
  for insert to authenticated with check (public.is_staff());
create policy "staff edit lesson notes" on public.lessons
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- photos
create policy "see allowed photos" on public.photos
  for select to authenticated using (public.can_see_photo(id));
create policy "staff add photos" on public.photos
  for insert to authenticated with check (public.is_staff() and uploaded_by = auth.uid());
create policy "owner or admin deletes photos" on public.photos
  for delete to authenticated using (public.can_manage_photo(id));

-- photo tags: a parent only sees their own children's tags, never other children in a group photo
create policy "see allowed tags" on public.photo_students
  for select to authenticated using (public.can_see_student(student_id));
create policy "staff tag children with consent" on public.photo_students
  for insert to authenticated
  with check (
    public.can_manage_photo(photo_id)
    and exists (select 1 from public.students s where s.id = student_id and s.consent)
  );
create policy "staff remove tags" on public.photo_students
  for delete to authenticated using (public.can_manage_photo(photo_id));

-- ---------------------------------------------------------------------
-- 6. Private photo storage (no public links)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "staff upload photo files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_staff());
create policy "see allowed photo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.can_see_photo_file(name));
create policy "staff delete photo files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_staff() and public.can_see_photo_file(name));
