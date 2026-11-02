-- Usage writes go through /api/usage with the service role.
-- Drop anon and authenticated insert/update policies on users, sessions,
-- and usage_events. Select policies stay so an admin session can still read.
-- Do not apply this until the /api/usage deploy is reviewed. scripts/migrate.sh
-- applies it with the other files when you choose to run it.

drop policy if exists users_insert on public.users;
drop policy if exists users_update on public.users;
drop policy if exists users_anon_insert on public.users;

drop policy if exists sessions_insert on public.sessions;
drop policy if exists sessions_update on public.sessions;
drop policy if exists sessions_anon_insert on public.sessions;

drop policy if exists usage_events_insert on public.usage_events;
drop policy if exists usage_events_anon_insert on public.usage_events;

revoke insert, update on public.users from anon, authenticated;
revoke insert, update on public.sessions from anon, authenticated;
revoke insert, update on public.usage_events from anon, authenticated;
