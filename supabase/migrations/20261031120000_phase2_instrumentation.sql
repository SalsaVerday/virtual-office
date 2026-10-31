-- Phase 2 instrumentation. Apply with the Supabase CLI when a project exists.
-- The service role bypasses RLS. The browser uses the anon key and a user JWT.
-- With no project configured, the client keeps events in localStorage instead.

create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  entra_oid text unique,
  email text,
  display_name text,
  avatar_variant text,
  squad text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('squad', 'meeting', 'lounge', 'standup')),
  is_private boolean not null default false,
  bounds jsonb not null default '{}'::jsonb
);

create table public.presence (
  user_id uuid primary key references public.users (id) on delete cascade,
  status text not null default 'online' check (status in ('online', 'away', 'focus')),
  room_id uuid references public.rooms (id) on delete set null,
  last_seen_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  client text
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

create index usage_events_user_ts on public.usage_events (user_id, ts desc);
create index usage_events_name_ts on public.usage_events (name, ts desc);
create index sessions_user_started on public.sessions (user_id, started_at desc);
create index presence_room on public.presence (room_id);

alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.presence enable row level security;
alter table public.sessions enable row level security;
alter table public.usage_events enable row level security;

revoke all on public.users, public.rooms, public.presence, public.sessions, public.usage_events from anon;
revoke all on public.users, public.rooms, public.presence, public.sessions, public.usage_events from authenticated;

grant select, insert, update on public.users to authenticated;
grant select on public.rooms to authenticated;
grant select, insert, update on public.presence to authenticated;
grant select, insert, update on public.sessions to authenticated;
grant select, insert on public.usage_events to authenticated;

-- Created after public.users so the SQL body can see the table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.users where id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Own profile. Admins can read every profile. A client cannot grant is_admin.
-- (no policy lets a user set another row, and a user can only update their own row).
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy users_insert on public.users
  for insert to authenticated
  with check (id = auth.uid() and is_admin = false);

create policy users_update on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = public.is_admin());

create policy rooms_select on public.rooms
  for select to authenticated
  using (true);

create policy presence_select on public.presence
  for select to authenticated
  using (true);

create policy presence_insert on public.presence
  for insert to authenticated
  with check (user_id = auth.uid());

create policy presence_update on public.presence
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy sessions_select on public.sessions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy sessions_insert on public.sessions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy sessions_update on public.sessions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy usage_events_select on public.usage_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy usage_events_insert on public.usage_events
  for insert to authenticated
  with check (user_id = auth.uid());

insert into public.rooms (name, type, is_private, bounds) values
  ('Squad A', 'squad', false, '{"x":32,"y":64,"width":480,"height":288}'::jsonb),
  ('Squad B', 'squad', false, '{"x":512,"y":64,"width":512,"height":288}'::jsonb),
  ('Squad C', 'squad', false, '{"x":1024,"y":64,"width":480,"height":288}'::jsonb),
  ('Squad D', 'squad', false, '{"x":32,"y":672,"width":480,"height":256}'::jsonb),
  ('Squad E', 'squad', false, '{"x":512,"y":672,"width":512,"height":256}'::jsonb),
  ('Meeting 1', 'meeting', true, '{"x":1056,"y":672,"width":192,"height":256}'::jsonb),
  ('Meeting 2', 'meeting', true, '{"x":1280,"y":672,"width":224,"height":256}'::jsonb),
  ('Lounge', 'lounge', false, '{"x":32,"y":384,"width":416,"height":256}'::jsonb),
  ('Standup', 'standup', false, '{"x":608,"y":384,"width":320,"height":256}'::jsonb);
