-- Minimal emulation of the parts of Supabase that our migrations and RLS
-- policies depend on, so RLS can be tested in-process with PGlite.
create schema if not exists auth;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key,
  email text unique
);

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant references, select on auth.users to authenticated, service_role;

-- Supabase grants table privileges to the API roles by default; RLS is what
-- actually protects rows.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
