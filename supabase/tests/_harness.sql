-- Supabase-compatible shim so migrations + RLS policies can be loaded and
-- tested against a vanilla Postgres. Mirrors the parts of the Supabase
-- platform the schema depends on: auth schema, roles, JWT claim helpers,
-- and minimal storage stubs.

-- Roles used by Supabase / PostgREST
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin noinherit; end if;
end $$;

grant anon, authenticated, service_role to postgres;

create schema if not exists test;

-- auth schema + users table (subset)
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- JWT claim helpers, matching Supabase's definitions
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

create or replace function auth.email() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )
$$;

-- storage schema stubs (buckets/objects + foldername helper)
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

grant usage on schema auth, storage, public, test to anon, authenticated, service_role;

-- Helpers to set the JWT request context at SESSION scope (is_local = false),
-- so it persists across psql autocommit statements. The matching `SET ROLE`
-- must be issued as a top-level statement in the test script (a role change
-- inside a function would not persist).
create or replace function test.auth_claims(p_uid uuid, p_email text default null) returns void
  language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated', 'email', coalesce(p_email,''))::text,
    false);
end $$;

create or replace function test.anon_claims() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, false);
end $$;

create or replace function test.assert(cond boolean, msg text) returns void
  language plpgsql as $$ begin if not cond then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
