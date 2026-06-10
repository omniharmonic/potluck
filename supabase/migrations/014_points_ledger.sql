-- ============================================================
-- 014 — Points ledger
-- Replaces the blind `increment_points` mutation with an auditable,
-- idempotent ledger. profiles.total_points is kept in sync as the sum of
-- ledger deltas. Verifying twice, un-verifying, changing a point value, or
-- deleting a contribution can no longer desync a participant's total.
-- ============================================================

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('claim', 'offer')),
  source_id uuid not null,
  delta integer not null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index points_ledger_profile_idx on public.points_ledger(profile_id);

alter table public.points_ledger enable row level security;
-- Read-only to the owner; all writes happen through SECURITY DEFINER functions.
create policy "Users can view their own points ledger"
  on public.points_ledger for select
  using (profile_id = auth.uid());

-- Idempotently set the points awarded for a single contribution. Computes the
-- delta against any previous award so re-verifying is a no-op and changing the
-- value adjusts the total correctly. Passing 0 removes the award.
create or replace function public.set_points(
  p_profile uuid,
  p_source_type text,
  p_source_id uuid,
  p_points integer
) returns void
language plpgsql
security definer
as $$
declare
  v_prev integer;
begin
  if p_profile is null then
    return;
  end if;

  select delta into v_prev
  from public.points_ledger
  where source_type = p_source_type and source_id = p_source_id;

  if p_points <= 0 then
    if v_prev is not null then
      delete from public.points_ledger
        where source_type = p_source_type and source_id = p_source_id;
      update public.profiles set total_points = total_points - v_prev
        where id = p_profile;
    end if;
    return;
  end if;

  if v_prev is null then
    insert into public.points_ledger (profile_id, source_type, source_id, delta)
      values (p_profile, p_source_type, p_source_id, p_points);
    update public.profiles set total_points = total_points + p_points
      where id = p_profile;
  else
    update public.points_ledger set delta = p_points
      where source_type = p_source_type and source_id = p_source_id;
    update public.profiles set total_points = total_points + (p_points - v_prev)
      where id = p_profile;
  end if;
end;
$$;

revoke all on function public.set_points(uuid, text, uuid, integer) from anon, authenticated;

-- Reverse any awarded points when a verified contribution is deleted, so a
-- host removing a claim/offer can't leave orphaned points on a profile.
create or replace function public.cleanup_points_on_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.profile_id is not null then
    perform public.set_points(old.profile_id, TG_ARGV[0], old.id, 0);
  end if;
  return old;
end;
$$;

create trigger claims_points_cleanup
  before delete on public.claims
  for each row execute function public.cleanup_points_on_delete('claim');

create trigger offers_points_cleanup
  before delete on public.offers
  for each row execute function public.cleanup_points_on_delete('offer');
