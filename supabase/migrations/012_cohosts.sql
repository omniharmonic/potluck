-- ============================================================
-- Co-hosts: allow multiple users to manage a single potluck
-- ============================================================

-- A. Helper function (security definer avoids RLS recursion)
create or replace function public.is_host_or_cohost(p_potluck_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.potlucks where id = p_potluck_id and host_id = p_user_id
  ) or exists (
    select 1 from public.cohosts where potluck_id = p_potluck_id and profile_id = p_user_id
  );
$$;

-- B. cohosts table
create table public.cohosts (
  id uuid primary key default gen_random_uuid(),
  potluck_id uuid not null references public.potlucks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(potluck_id, profile_id)
);

create index cohosts_potluck_id_idx on public.cohosts(potluck_id);
create index cohosts_profile_id_idx on public.cohosts(profile_id);

alter table public.cohosts enable row level security;

create policy "Cohosts are viewable by everyone"
  on public.cohosts for select using (true);

create policy "Hosts or cohosts can add cohosts"
  on public.cohosts for insert
  with check (public.is_host_or_cohost(potluck_id, auth.uid()));

create policy "Hosts, cohosts, or self can remove cohosts"
  on public.cohosts for delete
  using (
    public.is_host_or_cohost(potluck_id, auth.uid())
    or profile_id = auth.uid()
  );

-- C. cohost_invites table
create table public.cohost_invites (
  id uuid primary key default gen_random_uuid(),
  potluck_id uuid not null references public.potlucks(id) on delete cascade,
  email text not null,
  code text unique not null,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  unique(potluck_id, email)
);

create index cohost_invites_potluck_id_idx on public.cohost_invites(potluck_id);
create index cohost_invites_code_idx on public.cohost_invites(code);

alter table public.cohost_invites enable row level security;

create policy "Cohost invites are viewable by everyone"
  on public.cohost_invites for select using (true);

create policy "Hosts or cohosts can create cohost invites"
  on public.cohost_invites for insert
  with check (public.is_host_or_cohost(potluck_id, auth.uid()));

create policy "Cohost invites can be updated (accepted)"
  on public.cohost_invites for update using (true);

create policy "Hosts or cohosts can delete cohost invites"
  on public.cohost_invites for delete
  using (public.is_host_or_cohost(potluck_id, auth.uid()));


-- D. Update existing RLS policies to allow co-hosts
-- ============================================================

-- potlucks: UPDATE — allow co-hosts (DELETE stays host-only)
drop policy if exists "Hosts can update their potlucks" on public.potlucks;
create policy "Hosts can update their potlucks"
  on public.potlucks for update
  using (public.is_host_or_cohost(id, auth.uid()));

-- Also allow co-hosts to view potlucks they co-host
create policy "Cohosts can view their potlucks"
  on public.potlucks for select
  using (
    exists (select 1 from public.cohosts where potluck_id = id and profile_id = auth.uid())
  );

-- needs: INSERT, UPDATE, DELETE
drop policy if exists "Hosts can manage needs" on public.needs;
create policy "Hosts can manage needs"
  on public.needs for insert
  with check (public.is_host_or_cohost(potluck_id, auth.uid()));

drop policy if exists "Hosts can update needs" on public.needs;
create policy "Hosts can update needs"
  on public.needs for update
  using (public.is_host_or_cohost(potluck_id, auth.uid()));

drop policy if exists "Hosts can delete needs" on public.needs;
create policy "Hosts can delete needs"
  on public.needs for delete
  using (public.is_host_or_cohost(potluck_id, auth.uid()));

-- claims: UPDATE, DELETE
drop policy if exists "Hosts can update claims (for verification)" on public.claims;
create policy "Hosts can update claims (for verification)"
  on public.claims for update
  using (public.is_host_or_cohost(potluck_id, auth.uid()));

drop policy if exists "Claim owners or hosts can delete claims" on public.claims;
create policy "Claim owners or hosts can delete claims"
  on public.claims for delete
  using (
    profile_id = auth.uid()
    or public.is_host_or_cohost(potluck_id, auth.uid())
  );

-- offers: UPDATE, DELETE
drop policy if exists "Hosts can update offers (for verification)" on public.offers;
create policy "Hosts can update offers (for verification)"
  on public.offers for update
  using (public.is_host_or_cohost(potluck_id, auth.uid()));

drop policy if exists "Offer owners or hosts can delete offers" on public.offers;
create policy "Offer owners or hosts can delete offers"
  on public.offers for delete
  using (
    profile_id = auth.uid()
    or public.is_host_or_cohost(potluck_id, auth.uid())
  );

-- invites: SELECT (host-only policy), INSERT, DELETE
drop policy if exists "Invites are viewable by host" on public.invites;
create policy "Invites are viewable by host"
  on public.invites for select
  using (public.is_host_or_cohost(potluck_id, auth.uid()));

drop policy if exists "Hosts can create invites" on public.invites;
create policy "Hosts can create invites"
  on public.invites for insert
  with check (public.is_host_or_cohost(potluck_id, auth.uid()));

drop policy if exists "Hosts can delete invites" on public.invites;
create policy "Hosts can delete invites"
  on public.invites for delete
  using (public.is_host_or_cohost(potluck_id, auth.uid()));

-- rsvps: DELETE
drop policy if exists "RSVP owners or hosts can delete RSVPs" on public.rsvps;
create policy "RSVP owners or hosts can delete RSVPs"
  on public.rsvps for delete
  using (
    profile_id = auth.uid()
    or public.is_host_or_cohost(potluck_id, auth.uid())
  );
