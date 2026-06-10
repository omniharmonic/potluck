-- Demonstrates the CURRENT (pre-fix) vulnerabilities against the real
-- migrations. Run with migration 013 REMOVED to confirm the holes exist.
-- Roles are switched with top-level SET ROLE so RLS actually applies.
\set ON_ERROR_STOP on

set role postgres;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','host@example.com'),
  ('22222222-2222-2222-2222-222222222222','attacker@example.com');
-- profiles auto-created by handle_new_user trigger
insert into public.potlucks (id, host_id, title, description, event_date, location, access_level, slug)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
          'Secret','desc', now(), 'here', 'invite_only', 'secret-1');
insert into public.needs (id, potluck_id, name, quantity)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Pie',1);
insert into public.invites (potluck_id, email, code)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','guest@example.com','SECRETCODE');
insert into public.claims (need_id, potluck_id, guest_name, guest_email)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Guest','pii@example.com');

-- ===== anon =====
select test.anon_claims();
set role anon;
do $$ declare n int; begin
  select count(*) into n from public.invites;
  if n = 0 then raise exception 'unexpected: invites not anon-readable'; end if;
  raise notice 'VULN-1 confirmed: anon read % invite row(s) incl codes', n;
end $$;
do $$ declare e text; begin
  select guest_email into e from public.claims limit 1;
  raise notice 'VULN-2 confirmed: anon read guest_email=%', e;
end $$;
do $$ begin
  insert into public.claims (need_id, potluck_id, guest_name)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Sneaky');
  raise notice 'VULN-3 confirmed: anon inserted claim into invite-only potluck';
end $$;

-- ===== authenticated attacker =====
reset role; set role postgres;
select test.auth_claims('22222222-2222-2222-2222-222222222222','attacker@example.com');
set role authenticated;
do $$ begin
  insert into public.claims (need_id, potluck_id, profile_id)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111');
  raise notice 'VULN-4 confirmed: attacker attributed a claim to another user (host)';
end $$;
do $$ declare q int; begin
  select claimed_quantity into q from public.needs where id='dddddddd-dddd-dddd-dddd-dddddddddddd';
  if q > 1 then raise notice 'VULN-5 confirmed: claimed_quantity=% exceeds quantity=1', q; end if;
end $$;
reset role;
