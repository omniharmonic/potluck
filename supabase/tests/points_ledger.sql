-- Verifies the points ledger keeps profiles.total_points correct and
-- idempotent across verify / re-verify / unverify / delete.
\set ON_ERROR_STOP on
set role postgres;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','host@example.com'),
  ('22222222-2222-2222-2222-222222222222','member@example.com');
insert into public.potlucks (id, host_id, title, description, event_date, location, access_level, points_enabled, slug)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
          'P','d',now(),'here','public',true,'p-1');
insert into public.needs (id, potluck_id, name, quantity, point_value)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Pie',1,5);
insert into public.claims (id, need_id, potluck_id, profile_id)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc','dddddddd-dddd-dddd-dddd-dddddddddddd',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222');

create or replace function test.points(uid uuid) returns int language sql as $$
  select total_points from public.profiles where id = uid; $$;

-- award 5
select public.set_points('22222222-2222-2222-2222-222222222222','claim','cccccccc-cccc-cccc-cccc-cccccccccccc',5);
do $$ begin perform test.assert(test.points('22222222-2222-2222-2222-222222222222')=5,'award 5'); end $$;

-- re-verify (idempotent — still 5, not 10)
select public.set_points('22222222-2222-2222-2222-222222222222','claim','cccccccc-cccc-cccc-cccc-cccccccccccc',5);
do $$ begin perform test.assert(test.points('22222222-2222-2222-2222-222222222222')=5,'idempotent re-award'); end $$;

-- change value to 8
select public.set_points('22222222-2222-2222-2222-222222222222','claim','cccccccc-cccc-cccc-cccc-cccccccccccc',8);
do $$ begin perform test.assert(test.points('22222222-2222-2222-2222-222222222222')=8,'adjust to 8'); end $$;

-- unverify (back to 0)
select public.set_points('22222222-2222-2222-2222-222222222222','claim','cccccccc-cccc-cccc-cccc-cccccccccccc',0);
do $$ begin perform test.assert(test.points('22222222-2222-2222-2222-222222222222')=0,'unverify to 0'); end $$;

-- re-award then DELETE the claim → trigger reverses points
select public.set_points('22222222-2222-2222-2222-222222222222','claim','cccccccc-cccc-cccc-cccc-cccccccccccc',5);
do $$ begin perform test.assert(test.points('22222222-2222-2222-2222-222222222222')=5,'re-award before delete'); end $$;
delete from public.claims where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$ begin perform test.assert(test.points('22222222-2222-2222-2222-222222222222')=0,'delete reverses points'); end $$;
do $$ declare n int; begin
  select count(*) into n from public.points_ledger; perform test.assert(n=0,'ledger emptied on delete'); end $$;

select 'all points assertions passed' as result;
