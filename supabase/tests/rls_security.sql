-- Asserts the SECURE behaviour after migration 013. Any failure raises and
-- aborts the run. Roles switched via top-level SET ROLE so RLS applies.
\set ON_ERROR_STOP on

set role postgres;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','host@example.com'),
  ('22222222-2222-2222-2222-222222222222','attacker@example.com'),
  ('33333333-3333-3333-3333-333333333333','member@example.com');

insert into public.potlucks (id, host_id, title, description, event_date, location, access_level, open_offers, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Pub','d',now(),'here','public',true,'pub-1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Secret','d',now(),'here','invite_only',false,'sec-1');
insert into public.needs (id, potluck_id, name, quantity) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Pie',1),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Wine',2);
insert into public.invites (potluck_id, email, code) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','guest@example.com','SECRETCODE');
insert into public.cohost_invites (potluck_id, email, code) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','co@example.com','COCODE');

-- ============ ANON ============
select test.anon_claims();
set role anon;

-- FIX-1: invites + cohost_invites are NOT anon-readable
do $$ declare n int; begin
  select count(*) into n from public.invites; perform test.assert(n=0,'anon must not read invites'); end $$;
do $$ declare n int; begin
  select count(*) into n from public.cohost_invites; perform test.assert(n=0,'anon must not read cohost_invites'); end $$;

-- FIX-2: anon cannot read guest_email column at all
do $$ begin
  begin
    perform guest_email from public.claims limit 1;
    raise exception 'anon must not select claims.guest_email';
  exception when insufficient_privilege then null; end;
end $$;

-- FIX-3: anon cannot insert into an invite-only potluck it cannot view
do $$ begin
  begin
    insert into public.claims (need_id, potluck_id, guest_name)
      values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Sneaky');
    raise exception 'anon must not claim on invite-only potluck';
  exception when insufficient_privilege then null; end;
end $$;

-- positive control: anon CAN claim on a public potluck
insert into public.claims (need_id, potluck_id, guest_name) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Friend');

-- open_offers=false (and not visible) → offer insert blocked
do $$ begin
  begin
    insert into public.offers (potluck_id, guest_name, name) values
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','x','Chips');
    raise exception 'must not offer when open_offers is false / not visible';
  exception when insufficient_privilege then null; end;
end $$;

-- ============ AUTHENTICATED ATTACKER ============
reset role; set role postgres;
select test.auth_claims('22222222-2222-2222-2222-222222222222','attacker@example.com');
set role authenticated;

-- FIX-4: cannot attribute a claim to another user's profile
do $$ begin
  begin
    insert into public.claims (need_id, potluck_id, profile_id) values
      ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '11111111-1111-1111-1111-111111111111');
    raise exception 'must not attribute claim to another profile';
  exception when insufficient_privilege then null; end;
end $$;

-- attacker cannot view the invite-only potluck's claims
do $$ declare n int; begin
  select count(*) into n from public.claims
    where potluck_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  perform test.assert(n=0,'non-member must not read invite-only claims'); end $$;

-- ============ CAPACITY (FIX-5) ============
reset role; set role postgres;
do $$ begin
  perform public.create_claim('dddddddd-dddd-dddd-dddd-dddddddddddd',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'A', null, 'tok1', 1);
  raise exception 'create_claim should have raised NEED_FULL';
exception when others then
  if sqlerrm <> 'NEED_FULL' then raise; end if;
end $$;
do $$ declare q int; begin
  select claimed_quantity into q from public.needs where id='dddddddd-dddd-dddd-dddd-dddddddddddd';
  perform test.assert(q = 1, format('capacity must hold; claimed=%s', q)); end $$;

-- ============ HOST can still manage ============
reset role; set role postgres;
select test.auth_claims('11111111-1111-1111-1111-111111111111','host@example.com');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.invites
    where potluck_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  perform test.assert(n=1,'host must read own invites'); end $$;
do $$ declare n int; begin
  select count(*) into n from public.claims
    where potluck_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform test.assert(n>=1,'host must read own potluck claims'); end $$;

reset role;
select 'all security assertions passed' as result;
