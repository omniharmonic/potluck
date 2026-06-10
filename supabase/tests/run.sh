#!/usr/bin/env bash
# Loads the Supabase shim + all migrations into a fresh DB, applies the
# Supabase-style table grants, then runs an RLS assertion file.
# Usage: run.sh <test_file.sql>
set -euo pipefail

PSQL="psql -v ON_ERROR_STOP=1 -U postgres -h /var/run/postgresql -X -q"
DB="potluck_test"
DIR="$(cd "$(dirname "$0")" && pwd)"
MIG="$DIR/../migrations"

$PSQL -d postgres -c "drop database if exists $DB" >/dev/null
$PSQL -d postgres -c "create database $DB" >/dev/null

$PSQL -d $DB -f "$DIR/_harness.sql" >/dev/null

# Replicate Supabase's default privileges: objects created by `postgres` in
# `public` are auto-granted to anon/authenticated/service_role at creation
# time. Migration-level REVOKEs (e.g. column locks in 013) then stick.
$PSQL -d $DB <<'SQL' >/dev/null
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
SQL

for f in $(ls "$MIG"/*.sql | sort); do
  $PSQL -d $DB -f "$f" >/dev/null
done

$PSQL -d $DB -c "grant all on storage.objects to anon, authenticated, service_role" >/dev/null

$PSQL -d $DB -f "$1"
echo "PASS: $(basename "$1")"
