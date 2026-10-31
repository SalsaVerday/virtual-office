-- Dev-login usage rows use UUIDv5(DEV_USAGE_NAMESPACE, 'dev:…'), not auth.users ids.
-- Drop the auth.users foreign key so those rows can be inserted.
-- The anon key (no Supabase session) may write them. is_admin still cannot be set.

alter table public.users drop constraint if exists users_id_fkey;

grant select, insert on public.users to anon;
grant select, insert on public.sessions to anon;
grant select, insert on public.usage_events to anon;
grant select, insert, update on public.presence to anon;

create policy users_anon_insert on public.users
  for insert to anon
  with check (is_admin = false);

create policy sessions_anon_insert on public.sessions
  for insert to anon
  with check (true);

create policy usage_events_anon_insert on public.usage_events
  for insert to anon
  with check (true);

create policy presence_anon_insert on public.presence
  for insert to anon
  with check (true);

create policy presence_anon_update on public.presence
  for update to anon
  using (true)
  with check (true);
