-- ============================================================
-- 013 — Security hardening
-- Closes the critical RLS holes:
--   * world-readable invite codes / co-host codes / guest PII
--   * unauthenticated & spoofable writes
--   * unenforced capacity
-- Introduces canonical access helpers, guest capability tokens,
-- and a capacity-safe claim RPC. See potluck_evaluation_and_strategy.md.
-- ============================================================

-- ------------------------------------------------------------
-- A. Guest capability tokens
--    Ownership of a guest claim/offer/rsvp is proven by possessing
--    this random token (returned once at creation), NOT by matching
--    a display name. These columns are secret and never exposed.
-- ------------------------------------------------------------
alter table public.claims add column if not exists guest_token text;
alter table public.offers add column if not exists guest_token text;
alter table public.rsvps  add column if not exists guest_token text;

-- ------------------------------------------------------------
-- B. Canonical authorization helpers (security definer, no recursion)
-- ------------------------------------------------------------
create or replace function public.can_view_potluck(p_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.potlucks p
    where p.id = p_id
      and (
        p.access_level in ('public', 'link_shared')
        or p.host_id = auth.uid()
        or public.is_host_or_cohost(p.id, auth.uid())
        or public.has_accepted_invite(p.id)
      )
  );
$$;

create or replace function public.can_manage_potluck(p_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_host_or_cohost(p_id, auth.uid());
$$;

-- ------------------------------------------------------------
-- C. claims — scoped reads, non-spoofable writes
-- ------------------------------------------------------------
drop policy if exists "Claims are viewable by everyone with potluck access" on public.claims;
create policy "Claims readable with potluck access"
  on public.claims for select
  using ( public.can_view_potluck(potluck_id) );

drop policy if exists "Anyone can create claims" on public.claims;
create policy "Claims insert: visible potluck, own identity"
  on public.claims for insert
  with check (
    public.can_view_potluck(potluck_id)
    and (profile_id is null or profile_id = auth.uid())
  );

-- UPDATE (verification) + DELETE policies already exist (migration 012) and
-- are correct: manage-only update, owner-or-manager delete. Guest deletes are
-- performed server-side with the service role after verifying the token.

-- ------------------------------------------------------------
-- D. offers — scoped reads, enforce open_offers + identity on write
-- ------------------------------------------------------------
drop policy if exists "Offers are viewable by everyone with potluck access" on public.offers;
create policy "Offers readable with potluck access"
  on public.offers for select
  using ( public.can_view_potluck(potluck_id) );

drop policy if exists "Anyone can create offers" on public.offers;
create policy "Offers insert: visible potluck, open offers, own identity"
  on public.offers for insert
  with check (
    public.can_view_potluck(potluck_id)
    and (profile_id is null or profile_id = auth.uid())
    and exists (
      select 1 from public.potlucks p
      where p.id = potluck_id and p.open_offers = true
    )
  );

-- ------------------------------------------------------------
-- E. rsvps — scoped reads, identity on write
-- ------------------------------------------------------------
drop policy if exists "RSVPs are viewable by everyone" on public.rsvps;
create policy "RSVPs readable with potluck access"
  on public.rsvps for select
  using ( public.can_view_potluck(potluck_id) );

drop policy if exists "Anyone can create RSVPs" on public.rsvps;
create policy "RSVPs insert: visible potluck, own identity"
  on public.rsvps for insert
  with check (
    public.can_view_potluck(potluck_id)
    and (profile_id is null or profile_id = auth.uid())
  );

-- ------------------------------------------------------------
-- F. invites / cohost_invites — NOT world readable
--    Code validation happens server-side with the service role.
-- ------------------------------------------------------------
drop policy if exists "Anyone can read invites by code (for validation)" on public.invites;
-- host/cohost select policy from migration 012 remains.

drop policy if exists "Cohost invites are viewable by everyone" on public.cohost_invites;
create policy "Cohost invites viewable by managers"
  on public.cohost_invites for select
  using ( public.can_manage_potluck(potluck_id) );

-- ------------------------------------------------------------
-- G. Column-level lockdown: guest PII + secret tokens are never
--    selectable through the public/anon/authenticated API surface.
--    A table-level SELECT grant covers every column, so we must revoke
--    the table grant and re-grant only the safe columns. Hosts read guest
--    emails through a dedicated server route (service role).
-- ------------------------------------------------------------
revoke select on public.claims from anon, authenticated;
grant select (id, need_id, potluck_id, profile_id, guest_name,
              quantity, verified, points_awarded, created_at)
  on public.claims to anon, authenticated;

revoke select on public.rsvps from anon, authenticated;
grant select (id, potluck_id, profile_id, guest_name, created_at)
  on public.rsvps to anon, authenticated;

revoke select on public.offers from anon, authenticated;
grant select (id, potluck_id, profile_id, guest_name, emoji, name,
              description, verified, points_awarded, created_at)
  on public.offers to anon, authenticated;

-- ------------------------------------------------------------
-- H. profiles — limit public columns (PRD §3.3)
--    Anon/authenticated may read identity columns only, not timestamps.
-- ------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, total_points) on public.profiles to anon, authenticated;

-- ------------------------------------------------------------
-- I. Capacity-safe claim creation (row lock prevents over-claiming)
-- ------------------------------------------------------------
create or replace function public.create_claim(
  p_need_id uuid,
  p_potluck_id uuid,
  p_profile_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_token text,
  p_quantity integer
) returns public.claims
language plpgsql
security definer
as $$
declare
  v_need public.needs;
  v_claim public.claims;
begin
  select * into v_need from public.needs where id = p_need_id for update;
  if v_need.id is null then
    raise exception 'NEED_NOT_FOUND';
  end if;
  if v_need.potluck_id <> p_potluck_id then
    raise exception 'NEED_POTLUCK_MISMATCH';
  end if;
  if v_need.claimed_quantity + p_quantity > v_need.quantity then
    raise exception 'NEED_FULL';
  end if;

  insert into public.claims (need_id, potluck_id, profile_id, guest_name, guest_email, guest_token, quantity)
    values (p_need_id, p_potluck_id, p_profile_id, p_guest_name, p_guest_email, p_guest_token, p_quantity)
    returning * into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.create_claim(uuid, uuid, uuid, text, text, text, integer) from anon, authenticated;
