-- =====================================================================
-- Art Class Gallery — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- People
-- One row per login. role = 'admin' | 'teacher' | 'student'
-- A 'student' login is used by that child's parent (one login per child).
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  login_id      text unique not null,
  role          text not null check (role in ('admin','teacher','student')),
  display_name  text not null,
  class_scope   text,                 -- teachers only: null = sees every class
  secret_set    boolean not null default false,  -- has chosen their own PIN / password
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Login secrets live in their own table that ONLY the server function can read.
create table public.auth_secrets (
  id              uuid primary key references public.profiles(id) on delete cascade,
  otc_hash        text,               -- one-time code (hashed)
  otc_expires_at  timestamptz,
  failed_attempts int not null default 0,
  locked_until    timestamptz
);

create table public.students (
  id          uuid primary key references public.profiles(id) on delete cascade,
  full_name   text not null,
  dob         date,
  class_group text not null default 'Young',
  level       text,
  consent     boolean not null default false,  -- parent agreed to photos
  notes       text,
  created_at  timestamptz not null default now()
);

create table public.level_history (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references public.students(id) on delete cascade,
  level       text not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.profiles(id) on delete set null
);
create index level_history_student_idx on public.level_history(student_id, changed_at desc);

-- ---------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------
create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  path         text not null unique,    -- full-size image in storage
  thumb_path   text not null unique,    -- small preview in storage
  taken_on     date not null,
  note         text,
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
-- Helper checks used by the security rules
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','teacher'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Admin: every child. Teacher: every child, or only their class if class_scope is set.
-- Parent (student login): only their own child.
create or replace function public.can_see_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.active and (
      p.role = 'admin'
      or (p.role = 'student' and p.id = sid)
      or (p.role = 'teacher' and (
            p.class_scope is null
            or exists (select 1 from students s where s.id = sid and s.class_group = p.class_scope)))
    )
  )
$$;

create or replace function public.can_see_photo(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos ph
    where ph.id = pid and (
      public.is_admin()
      or (ph.uploaded_by = auth.uid() and public.is_staff())
      or exists (select 1 from photo_students ps
                 where ps.photo_id = ph.id and public.can_see_student(ps.student_id))
    )
  )
$$;

create or replace function public.can_see_photo_file(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos ph
    where (ph.path = obj or ph.thumb_path = obj) and public.can_see_photo(ph.id)
  )
$$;

create or replace function public.can_manage_photo(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos ph
    where ph.id = pid and (public.is_admin() or (public.is_staff() and ph.uploaded_by = auth.uid()))
  )
$$;

-- Level changes (teachers and admin). History is written by the trigger below.
create or replace function public.set_level(sid uuid, new_level text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_staff() and public.can_see_student(sid)) then
    raise exception 'You are not allowed to change this child''s level';
  end if;
  update students set level = new_level where id = sid;
end $$;

create or replace function public.log_level_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.level is not null and (tg_op = 'INSERT' or new.level is distinct from old.level) then
    insert into level_history(student_id, level, changed_by) values (new.id, new.level, auth.uid());
  end if;
  return new;
end $$;

create trigger students_level_history
after insert or update of level on public.students
for each row execute function public.log_level_change();

-- Used by the server function when a login is reset: signs out every device.
create or replace function public.revoke_sessions(uid uuid) returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where user_id = uid;
$$;
revoke execute on function public.revoke_sessions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Security rules (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.auth_secrets   enable row level security;
alter table public.students       enable row level security;
alter table public.level_history  enable row level security;
alter table public.photos         enable row level security;
alter table public.photo_students enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.students, public.level_history,
  public.photos, public.photo_students to authenticated;
revoke all on public.auth_secrets from anon, authenticated;   -- server function only
grant all on public.profiles, public.auth_secrets, public.students, public.level_history,
  public.photos, public.photo_students to service_role;       -- the server function
grant usage, select on all sequences in schema public to service_role;
revoke all on public.profiles, public.students, public.level_history,
  public.photos, public.photo_students from anon;

-- profiles
create policy "see own, staff see children, admin sees all" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin()
         or (public.is_staff() and role = 'student' and public.can_see_student(id)));
create policy "admin edits people" on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- students
create policy "see allowed children" on public.students
  for select to authenticated using (public.can_see_student(id));
create policy "admin edits children" on public.students
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- level history
create policy "see allowed history" on public.level_history
  for select to authenticated using (public.can_see_student(student_id));

-- photos
create policy "see allowed photos" on public.photos
  for select to authenticated using (public.can_see_photo(id));
create policy "staff add photos" on public.photos
  for insert to authenticated with check (public.is_staff() and uploaded_by = auth.uid());
create policy "owner or admin edits photos" on public.photos
  for update to authenticated using (public.can_manage_photo(id)) with check (public.can_manage_photo(id));
create policy "owner or admin deletes photos" on public.photos
  for delete to authenticated using (public.can_manage_photo(id));

-- photo tags: a parent only sees their own child's tag, never the other children in a group photo
create policy "see allowed tags" on public.photo_students
  for select to authenticated
  using (public.can_see_student(student_id) or public.can_manage_photo(photo_id));
create policy "staff tag children with consent" on public.photo_students
  for insert to authenticated
  with check (
    public.can_manage_photo(photo_id)
    and public.can_see_student(student_id)
    and exists (select 1 from public.students s where s.id = student_id and s.consent)
  );
create policy "staff remove tags" on public.photo_students
  for delete to authenticated using (public.can_manage_photo(photo_id));

-- ---------------------------------------------------------------------
-- Private photo storage (no public links; files load only through signed,
-- expiring links for people allowed to see them)
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
