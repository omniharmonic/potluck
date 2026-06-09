# Potluck — Production Readiness Evaluation & First‑Principles Improvement Strategy

**Author:** Engineering review (Claude)
**Date:** 2026‑06‑09
**Scope reviewed:** Full `src/` tree (60+ files), all 12 SQL migrations, `middleware.ts`, config, PRD, Technical Architecture, and Implementation Plan.
**Branch:** `claude/adoring-noether-bltvz1`

---

## 0. Methodology & honest testing caveat

This is a **static** evaluation backed by:

- A complete read of every source file, every migration, and the three planning docs.
- `tsc --noEmit` — **passes** (no type errors).
- `next lint` — **no ESLint config exists** (the interactive "set up ESLint" prompt fires), so the `npm run lint` script is non‑functional today.
- Cross‑referencing every PRD feature/non‑functional requirement against the implementation.

What I **did not** do, and why it matters: I could not run *live* front‑end/back‑end testing across devices. This container is ephemeral and has **no Supabase project, credentials, or seed data** wired up, so there is no running backend to exercise auth, RLS, realtime, or uploads against. Every behavioral claim below is derived from reading the code and the RLS policies, not from observing the deployed app. Several of the most serious findings (e.g. guest unclaim silently failing, invite‑only being bypassable) should be **confirmed with a live RLS test** using the harness in §9 before and after the fixes land. I flag confidence levels where it matters.

**Bottom line verdict:** The product is visually polished, the feature surface is broad (it actually *exceeds* the v1 PRD in places), and the happy‑path UX is genuinely nice. But it is **not production‑ready**. There is a cluster of **critical data‑exposure and authorization holes in the Row‑Level Security layer**, several broken or defeated security flows, multiple PRD requirements unimplemented (drag‑and‑drop reorder, notifications, rate limiting), and **zero automated tests, no CI, and no lint**. These are fixable; the rest of this document is the plan.

---

## 1. What Potluck is actually trying to be (first principles)

Strip away the feature list and Potluck is one primitive:

> **A shared, low‑friction commitment ledger.** A host publishes a set of *needs*; identity‑light participants *commit* to items without double‑booking; the host can later *attest* that commitments were honored, optionally minting reputation.

Three invariants fall out of that definition, and they are the lens for the whole review:

1. **Commitment integrity.** A need has finite capacity. Two people must not silently both "own" the last slot, and no one should be able to commit *on behalf of* someone else or tamper with another person's commitment. → *This is currently not enforced; capacity is advisory and identity is spoofable.*
2. **Identity is a capability, not a claim.** The PRD's headline feature is **guest participation** — "claim a need in under 30 seconds, no account." That means guest identity can't lean on accounts, but it also can't be "whatever name string the client sends," because then anyone can impersonate or delete anyone. The right primitive is a **per‑participant capability token** (a secret the guest holds), not a display‑name match in `localStorage`. → *Currently identity is a `localStorage` name string; ownership is matched by `guest_name` equality.*
3. **The host is the trust root, and attestation is the output.** Verification/points is the bridge to the "broader coordination stack" the PRD describes (the `verified` boolean is explicitly designed to become an on‑chain attestation later). That makes correctness of the verify/points path a *product* concern, not just a bug class. → *The verify path is host‑gated correctly, but the panel has stale‑state bugs and the points ledger has no audit trail.*

The single highest‑leverage architectural decision the codebase gets *wrong* is **#2/#3 of the security model: it makes RLS the only line of defense for anonymous, unauthenticated writes**, while simultaneously leaving those policies wide open (`using (true)` / `with check (true)`). Everything in §3 flows from that.

---

## 2. PRD compliance matrix

| PRD § | Requirement | Status | Notes |
|---|---|---|---|
| 5.1 | Potluck creation (all fields, banner, points toggle) | ✅ | `create/page.tsx`, `api/potlucks/route.ts`. Solid. |
| 5.2 | Needs: add/edit/remove | ✅ | `manage/page.tsx`, `needs-builder.tsx`. |
| 5.2 | **Needs: drag‑and‑drop reorder** | ❌ | **Not implemented.** `needs-builder.tsx:71‑81` is a fake "drag" that only moves *up* one slot on click; hidden on mobile (`hidden sm:block`) so reorder is impossible on phones. Manage page has no reorder at all. |
| 5.3 | Claim / unclaim one‑tap | ⚠️ | Claim works; **guest unclaim likely silently fails under correct RLS** (§4.1). |
| 5.3 | Open offers | ✅ | `offer-form.tsx`. |
| 5.3 | Guest claim with display name | ⚠️ | Works, but identity is spoofable (§3.4). |
| 5.4 | Host dashboard, progress, verification, share | ✅ | `manage/page.tsx` (1018 lines — see §6.1). |
| 5.5 | Participant view, personal summary | ⚠️ | View exists; "what you've committed to bring" personal summary is **not** surfaced on the potluck page. |
| 5.6 | Public homepage feed, search | ✅ | `page.tsx`. Search is `ilike` (§4.6 pagination bug). |
| 5.7 | Accounts, OAuth Google, profiles | ✅ | `auth/login`, `profile/`. |
| 5.8 | Points / verification end‑to‑end | ✅ | `verify/route.ts`. Works; no audit trail (§5.4). |
| 5.9 | **Notifications (email on claim / on verify)** | ❌ | **Not implemented.** Only invite & co‑host emails exist. `guest_email` is collected "for notifications" but never used. |
| 6 | Perf < 2s on 3G, realtime | ⚠️ | Realtime works but **refetches the entire dataset on every event** (§4.5); `<img>` not `next/image` for banners. |
| 6 | **WCAG 2.1 AA** | ❌ | Numerous failures (§7). |
| 6 | Mobile‑first | ✅ | Generally strong; a few gaps (§8). |
| 6 | **Security: RLS, rate limiting, input sanitization** | ❌ | RLS is permissive (§3); **no rate limiting anywhere**; server‑side input validation partial. |
| 7 | Out of scope: **multi‑host / co‑host** | ⚠️ | Co‑hosts were **built anyway** (migration 012). Calendar integration (also out‑of‑scope) was built too. Not wrong, but it's scope creep that added the largest security surface (admin‑client invite acceptance). |

Net: ~70% of functional PRD is delivered and the team shipped *beyond* it on co‑hosts/RSVPs/calendar, but the **non‑functional** requirements that gate "production" (security, a11y, notifications, perf) are the weakest part.

---

## 3. Critical security findings (severity‑ordered)

> These are the items that should block a "production ready / security hardened" sign‑off. Each has the offending code, the impact, and a concrete fix.

### 3.1 — 🔴 CRITICAL: World‑readable PII and secrets via `SELECT … USING (true)`

Four tables grant unconditional read to the **anonymous public key**:

```sql
-- 003_needs_claims_offers.sql
create policy "Claims are viewable by everyone with potluck access"
  on public.claims for select using (true);          -- exposes guest_email of every claim
-- 011_rsvps.sql
create policy "RSVPs are viewable by everyone"
  on public.rsvps for select using (true);           -- exposes guest_email of every RSVP
-- 004_invites.sql
create policy "Anyone can read invites by code (for validation)"
  on public.invites for select using (true);         -- exposes every invite email + code
-- 012_cohosts.sql
create policy "Cohost invites are viewable by everyone"
  on public.cohost_invites for select using (true);  -- exposes every co-host email + code
```

**Impact:** Anyone with the public anon key (which ships to every browser) can run, from the console on any page:

```js
const { data } = await supabase.from('invites').select('*')   // → every invite code + email in the DB
const { data } = await supabase.from('claims').select('guest_email')  // → every guest email
```

This is a **PII breach** (guest emails) and a **secret leak** (invite/co‑host codes). It's GDPR‑relevant and it directly defeats §3.2 below.

**Fix:** Stop returning sensitive columns to the public and scope reads. Two layers:

1. **Never expose `guest_email`** to the client at all. It's only needed server‑side for notifications. Split it out or always select explicit columns. Since RLS can't do column‑level filtering on `select *`, the robust fix is to **move all reads that include email server‑side** and have the client only ever select non‑PII columns. At minimum, revoke broad select and replace with scoped policies:

```sql
-- claims: readable only to people who can see the parent potluck; never expose email to anon
drop policy "Claims are viewable by everyone with potluck access" on public.claims;
create policy "Claims readable with potluck access"
  on public.claims for select
  using ( public.can_view_potluck(potluck_id) );   -- helper defined in §3.2

-- And revoke column access to guest_email from anon/authenticated entirely:
revoke select (guest_email) on public.claims from anon, authenticated;
revoke select (guest_email) on public.rsvps  from anon, authenticated;
```

2. **Invites/co‑host invites must never be world‑readable.** Validation by code must happen **server‑side** with the service/admin client (the app already has `createAdminClient`). Replace the `using (true)` select policies with host‑only select, and do code lookups in API routes:

```sql
drop policy "Anyone can read invites by code (for validation)" on public.invites;
-- keep only: host/cohost can select; everything else goes through a server route using the admin client
```

The `/invite/[code]` and `/cohost-invite/[code]` routes already use server clients, so the public select policy is **pure attack surface with no legitimate consumer** — delete it.

---

### 3.2 — 🔴 CRITICAL: `invite_only` access control is fully bypassable

The invite‑only model is supposed to gate viewing a potluck. It doesn't, for two compounding reasons:

1. Invite **codes are world‑readable** (§3.1), so an attacker can enumerate every code.
2. The potluck page takes *any* invite code as a query param and falls back to a privileged client:

```ts
// p/[slug]/page.tsx:79‑99
if ((error || !potluckData) && inviteCode) {
  const serviceClient = await createServiceClient();
  const inviteCheck = await serviceClient.from("invites")
    .select("potluck_id").eq("code", inviteCode).single();
  if (inviteCheck.data) {
    const fallback = await serviceClient.from("potlucks").select("*").eq("slug", slug).single();
    ...
  }
}
```

Combined: `GET /p/<any-slug>?invite=<any-leaked-code>` → full read of an invite‑only potluck by anyone. Even without a leaked code, §3.1 hands them the codes.

Worse, visiting `/invite/[code]` **marks the invite accepted on a plain GET** with the service role and *no authentication*:

```ts
// invite/[code]/page.tsx:22‑27
if (!invite.accepted) {
  await supabase.from("invites").update({ accepted: true }).eq("id", invite.id);
}
```

A Slack/iMessage link‑unfurl bot, a crawler, or a prefetch will silently "accept" invites. Acceptance becomes meaningless, and since the `has_accepted_invite` RLS policy (migration 010) keys off `accepted = true`, a crawler hit can *grant* a future logged‑in user with that email access they never clicked through for.

**Fix:**
- Delete the public invite select policy (§3.1).
- Make invite **acceptance an authenticated POST**, mirroring the co‑host flow (`api/cohost-invite/[code]/route.ts` is the correct pattern). A GET should only *resolve and redirect*, never mutate.
- Validate codes server‑side only. Treat the `?invite=` fallback as a server‑checked capability, and bind acceptance to the authenticated user's email.

---

### 3.3 — 🔴 CRITICAL: Unrestricted, unauthenticated, unthrottled writes

```sql
create policy "Anyone can create claims" on public.claims for insert with check (true);
create policy "Anyone can create offers" on public.offers for insert with check (true);
create policy "Anyone can create RSVPs"  on public.rsvps  for insert with check (true);
```

`with check (true)` means an anonymous client can insert **arbitrary rows into any potluck**, with **any `potluck_id`**, at **any volume**. There is no rate limiting anywhere in the stack (no middleware, no Upstash, nothing). Consequences:

- **Spam/DoS:** a script inserts millions of claims/offers/RSVPs across every potluck.
- **No access‑level enforcement on write:** you can claim/offer/RSVP on an `invite_only` potluck you can't even view.
- **No capacity enforcement:** `claimed_quantity` is bumped by a trigger *after* insert (`update_claimed_quantity`), but nothing stops `claimed_quantity` from exceeding `quantity` under concurrency or malice. The "Full" state (`claim-button.tsx:35`) is purely cosmetic.
- **`open_offers = false` is not enforced on the server** — the offer insert policy doesn't check it, so offers can be created even when the host disabled them.

**Fix — the structural recommendation:** route **all participant writes through server API routes** (`POST /api/potlucks/[slug]/claims`, `/offers`, `/rsvps`) and make the tables **insert‑deny to anon by default**. The server route then:
1. Loads the potluck and enforces access level + `open_offers`.
2. Enforces capacity transactionally (see RPC below).
3. Applies rate limiting (per IP + per potluck).
4. Issues/uses a guest capability token (§3.4).

Transactional capacity‑safe claim:

```sql
create or replace function public.create_claim(
  p_need_id uuid, p_potluck_id uuid, p_profile_id uuid,
  p_guest_name text, p_guest_email text, p_quantity int
) returns public.claims language plpgsql security definer as $$
declare v_need public.needs; v_claim public.claims;
begin
  select * into v_need from public.needs where id = p_need_id for update;          -- row lock
  if v_need.claimed_quantity + p_quantity > v_need.quantity then
    raise exception 'NEED_FULL';
  end if;
  insert into public.claims(need_id, potluck_id, profile_id, guest_name, guest_email, quantity)
    values (p_need_id, p_potluck_id, p_profile_id, p_guest_name, p_guest_email, p_quantity)
    returning * into v_claim;
  return v_claim;   -- the existing after-insert trigger updates claimed_quantity atomically under the lock
end; $$;
```

If you keep client‑side inserts for speed, at *minimum* tighten the policies so anon can't spoof identity:

```sql
create policy "claims insert: self or guest, with access" on public.claims for insert
  with check (
    public.can_view_potluck(potluck_id)
    and (profile_id is null or profile_id = auth.uid())   -- can't attribute to someone else
  );
```

Define one canonical access helper and reuse it everywhere:

```sql
create or replace function public.can_view_potluck(p_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.potlucks p
    where p.id = p_id
      and ( p.access_level in ('public','link_shared')
            or p.host_id = auth.uid()
            or public.is_host_or_cohost(p.id, auth.uid())
            or public.has_accepted_invite(p.id) )
  );
$$;
```

---

### 3.4 — 🔴 CRITICAL: Identity spoofing (authenticated and guest)

**Authenticated spoofing:** because insert is `with check (true)`, a logged‑in attacker can insert a claim/offer with **someone else's `profile_id`**:

```js
await supabase.from('claims').insert({ need_id, potluck_id, profile_id: '<victim-uuid>', quantity: 1 })
```

If the host later verifies that claim with points enabled, **points are awarded to the victim** (or an attacker pre‑seeds claims to farm their own points). The `(profile_id is null or profile_id = auth.uid())` check in §3.3 closes this.

**Guest spoofing & cross‑guest tampering:** guest identity is a `localStorage` name string (`guest-identity-modal.tsx`), and "ownership" is matched by name equality:

```ts
// claim-button.tsx:27‑33 — "my" claim = any claim whose guest_name equals my localStorage name
const userClaim = need.claims.find(c =>
  (user && c.profile_id === user.id) ||
  (!user && c.guest_name && c.guest_name === getStoredGuestIdentity()?.name));
// rsvp-section.tsx:43 — same pattern
```

Anyone who types the same display name is treated as the same person, can see "their" RSVP/claim as cancellable, and (if the delete RLS lets a guest through) can delete it. This is the §1 invariant #2 failure.

**Fix — guest capability tokens.** When a guest first acts, the server mints a random `guest_token` (stored in the row, returned to the client, persisted in `localStorage` alongside the name). Ownership = possessing the token, not matching the name:

```sql
alter table public.claims add column guest_token text;   -- random, server-generated
alter table public.rsvps  add column guest_token text;
alter table public.offers add column guest_token text;
-- delete policy for guests: token must match (checked in the server route, since RLS can't read localStorage)
```

Then unclaim/cancel goes through `DELETE /api/.../claims/[id]` with the token in the body; the server checks `row.profile_id = auth.uid()` **or** `row.guest_token = body.token`. This makes guest commitments tamper‑resistant without forcing accounts — directly serving the PRD's "guest participation is first‑class."

---

### 3.5 — 🟠 HIGH: Open redirect in the login flow

```ts
// auth/login/page.tsx:36, 67, 78
const redirect = searchParams.get("redirect") || "/";
...
window.location.href = redirect;        // attacker: /auth/login?redirect=https://evil.com
```

`redirect` is navigated to verbatim after a successful login, enabling phishing (credential‑harvest landing that bounces through your real, trusted login). The Google path also fails to encode it (`redirectTo=...&redirect=${redirect}`, line 92), which both breaks legitimate redirects containing `&`/`?` and widens the injection.

**Fix:** allow only same‑origin relative paths.

```ts
function safeRedirect(raw: string | null): string {
  if (!raw) return "/";
  // must be a path, not a URL, and not protocol-relative
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
const redirect = safeRedirect(searchParams.get("redirect"));
```

Apply the same guard in `auth/callback/route.ts:6` (`searchParams.get("redirect") || "/"` is reflected into a redirect there too).

---

### 3.6 — 🟠 HIGH: Misleading Supabase client names = latent privilege bugs

`lib/supabase/server.ts` exposes three clients with a dangerous naming trap:

- `createClient()` — anon key + user cookies. Fine.
- `createServiceClient()` — **service‑role key but still sends user cookies**, so PostgREST authenticates as the *user*, **not** service role. The name screams "bypasses RLS"; it does not. (The file even has a warning comment admitting this.)
- `createAdminClient()` — service‑role key, no cookies. Truly bypasses RLS.

This is a footgun: a future engineer will reach for `createServiceClient` expecting elevated privileges and either get a confusing RLS denial or, worse, write a query that *only* works because RLS happened to allow it. The verify route (`verify/route.ts:50`) uses `createServiceClient` for privileged writes that work **only because `increment_points` is `SECURITY DEFINER`** and the host already passes RLS — i.e., it's relying on a coincidence.

**Fix:** delete `createServiceClient`. Keep `createClient` (user) and rename `createAdminClient` → `createServiceRoleClient` with a loud comment. Audit the two call sites of `createServiceClient` (`p/[slug]/page.tsx`, `invite/[code]/page.tsx`) and replace with either the user client (if RLS should apply) or the admin client (if a deliberate, audited bypass is needed).

---

### 3.7 — 🟠 HIGH: HTML/email injection in invitation emails

`api/potlucks/[slug]/invite/route.ts:34‑92` and the co‑host route build HTML emails by **string‑interpolating unescaped user data** (`potluckTitle`, `hostName`, `description`, `location`):

```ts
<p ...>${potluckTitle}</p>
${description ? `<p ...>${description}</p>` : ""}
```

A host can put `<a href="https://phish">Click</a>` or markup into a title/description and send a styled phishing email *from your verified `potluck.exchange` domain* to arbitrary invitee emails. This launders the platform's sender reputation.

**Fix:** HTML‑escape every interpolated value, or use a templating lib that escapes by default (React Email / `@react-email/render`). Minimum:

```ts
const esc = (s: string) => s.replace(/[&<>"']/g, c =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));
```

Also consider that the invite route lets a host email **arbitrary addresses** with no per‑host send caps — a spam vector. Add a per‑host daily invite cap and basic email‑reputation hygiene.

---

### 3.8 — 🟡 MEDIUM: Other hardening items

- **`profiles` over‑exposure:** `create policy "Public profiles are viewable by everyone" using (true)` exposes `avatar_url`, timestamps to anon. PRD §3.3 says public read should be limited to `display_name` + `total_points`. Use a column grant or a view. (Low impact — no email in `profiles` — but it's a stated requirement.)
- **Slug generation is non‑cryptographic and unguarded:** `utils.ts:8‑16` uses `Math.random()`; `api/potlucks/route.ts` doesn't catch the unique‑violation (`23505`) → a collision returns a raw 500. Use `nanoid` (already a dep) and retry on conflict.
- **Banner/avatar uploads** trust client `file.type` for the MIME check (`upload/banner/route.ts:23`). The Supabase bucket `allowed_mime_types` is the real guard (good), but consider sniffing magic bytes and stripping EXIF.
- **Storage banner insert policy** allows any authenticated user to write to the `banners` bucket root with no per‑user folder check on *insert* (only delete checks ownership). The route happens to namespace by `user.id`, but the policy should enforce `(storage.foldername(name))[1] = auth.uid()` on insert too.
- **No security headers / CSP.** `next.config.mjs` sets none. Add a CSP, `X-Content-Type-Options`, `Referrer-Policy`, etc.
- **`useAuth` reads session client‑side and trusts it for `isHost`** (`potluck-detail-client.tsx:50`). That only controls UI affordances (real authz is server‑side), which is acceptable — but note the "Manage" button visibility is not a security boundary; the manage page must (and does, via redirect) re‑check.

---

## 4. Correctness & functional bugs

### 4.1 — Guest unclaim / RSVP‑cancel silently fails under correct RLS *(confidence: high, verify live)*
The delete policies are:
```sql
create policy "Claim owners or hosts can delete claims" on public.claims for delete
  using ( profile_id = auth.uid() or public.is_host_or_cohost(potluck_id, auth.uid()) );
```
For a guest, `auth.uid()` is `null` and `profile_id` is `null`, so `null = null` evaluates to `NULL` (not `true`) → the delete affects **0 rows but returns no error**. The client then shows `toast.success("Unclaimed…")` (`claim-button.tsx:69`) while nothing happened; after the realtime refetch the item reappears as claimed. Same for RSVP cancel. **The guest unclaim/cancel flow is broken** even though the UI says it worked. The §3.4 token model plus server‑mediated deletes fixes this properly.

### 4.2 — Verification panel keeps stale state after refetch
`verification-panel.tsx:27‑45` seeds `verifiedIds`/`offerPoints` from props **once** via lazy `useState`. After `onVerified?.()` triggers a parent refetch, the panel doesn't resync, so checkmarks can drift from server truth and a subsequent "Save" can clobber concurrent changes. Fix with a `useEffect` resync keyed on the incoming ids, or remount via `key={lastSavedAt}`.

### 4.3 — `MyPotlucksSection` crashes on null description + mutates props
`my-potlucks-section.tsx:54` calls `p.description.toLowerCase()` with no null guard (description is nullable in the type), so search throws if any potluck has a null description. Line 59's `.sort()` mutates the `hosted`/`participating` **prop arrays** in place. Fix: guard nulls and sort a copy (`[...list].sort()`).

### 4.4 — Banner upload silently dropped on create
`create/page.tsx:77‑81`: if `POST /api/upload/banner` returns non‑OK, `uploadedBannerUrl` stays `null` and the potluck is created **without a banner and with no error shown**. The user loses their image silently. Surface the error and let them retry before creating.

### 4.5 — Realtime "refetch storm" (perf, PRD §6)
Every realtime event triggers a **full re‑query of the whole collection** (`use-realtime-claims.ts:39, 51` → `refetchNeeds`). With N participants on a popular potluck, one claim fan‑outs to N full refetches; each refetch re‑pulls all needs+claims+profiles. This won't meet "<2s on 3G" under load and hammers the DB. Fix: apply the change payload to local state incrementally (the event already carries `new`/`old`), or debounce refetches.

### 4.6 — Homepage pagination off‑by‑one with search
`page.tsx:95` uses `.range((page-1)*perPage, page*perPage)` — that's `perPage + 1` rows, used to compute `hasMore` (fine), but when `query` is present the `.or(...)` filter is applied *after* range in the builder chain — acceptable, but the `hasMore` slice logic (107) and the count semantics aren't tested. Also `parseInt(params.page || "1")` (line 16) has no `NaN`/negative guard → `?page=abc` yields `NaN`, and `?page=-5` yields negative offsets.

### 4.7 — `createObjectURL` leak
`banner-upload.tsx:29` creates an object URL that is never `revokeObjectURL`'d on remove/replace/unmount. Minor but real memory leak on repeated re‑selection.

### 4.8 — Timezone handling is brittle string‑surgery, duplicated 5×
The app stores `event_date` as `timestamptz` but everywhere strips the zone with `.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "")` to force "wall‑clock" display (`utils.ts:43`, `potluck-detail-client.tsx:71`, `opengraph-image.tsx:37`, `invite/route.ts:26`, `manage/page.tsx`). This works only if the stored string keeps a predictable shape; a value with milliseconds or a real offset shifts the event time. The PRD explicitly wants "date & time **with timezone**." Recommend storing an explicit IANA `timezone` column and formatting with `Intl.DateTimeFormat(..., { timeZone })`, centralized in one helper. Right now there's no timezone stored at all, so an event is ambiguous across viewers.

### 4.9 — Co‑host invite "already accepted" false positive
`cohost-invite-client.tsx:43` derives the success state from `inviteAccepted` (a **global** flag on the invite row). If user A's link is opened by user B, B is shown "You're already a co‑host!" though they aren't. Co‑host invites should be single‑use *and* bound to the invited email, or acceptance state should be per‑user.

### 4.10 — Minor
- `loadingData` never reset and `fetchData` lacks try/catch in `profile/page.tsx` → spinner can hang forever on a transient error.
- Profile name/avatar edits update local state but not the `useAuth` profile, so the navbar shows stale data until reload.
- Emoji keyword search only matches the ~90 emojis present in `EMOJI_SEARCH_TERMS`; the rest are unsearchable (`emoji-picker.tsx:89`).
- `offer-form.tsx:168‑171` — the `GuestIdentityModal` `onSubmit(name,email)` params are ignored; it re‑reads `localStorage`. Fragile dead coupling.

---

## 5. Architecture & data‑model improvements (first‑principles)

### 5.1 — Make the server the single write path for participant actions
Today writes are split with no rationale: needs/claims/offers/rsvps/invite‑delete go **direct from the browser** (RLS‑only), while create/verify/invite/cohosts go through **API routes**. This is the root cause of §3.3/§3.4 and the §4.1 silent‑failure. Standardize: **all mutations through typed API routes** that (a) validate with Zod, (b) enforce access + capacity + `open_offers`, (c) rate‑limit, (d) handle guest tokens. RLS becomes defense‑in‑depth (deny‑by‑default), not the only guard. Reads can stay client‑side for realtime, but selecting only non‑PII columns.

### 5.2 — Centralize authorization
There are at least three overlapping notions of "can act": `is_host_or_cohost` (RPC), `has_accepted_invite` (RPC), and ad‑hoc `host_id = auth.uid()` checks scattered in policies and routes. Define **one** `can_view_potluck` and one `can_manage_potluck` (host/cohost) SQL helper (§3.3) and a matching TS `assertCanManage(slug, user)` used by every route. Today `api/potlucks/[slug]/route.ts`, `verify`, `invite`, `cohosts` each re‑implement the "load potluck, check isHostOrCohost" preamble — extract it.

### 5.3 — Enforce capacity and `open_offers` in the data layer
Per §3.3, capacity is advisory. Add the `create_claim` RPC (row‑locking) and an `open_offers` check on offer creation. This is core to invariant #1 ("no double‑booking").

### 5.4 — Give points an audit trail
`increment_points` blindly mutates `profiles.total_points`. Verifying, unverifying, deleting a verified claim, or a host editing point values can desync the denormalized total (e.g. deleting a verified claim doesn't decrement points — the `update_claimed_quantity` trigger handles quantity but nothing reverses awarded points on delete). Introduce a `points_ledger(profile_id, source_type, source_id, delta, created_at)` and compute `total_points` as `sum(delta)` (materialized or via trigger). This also future‑proofs the "on‑chain attestation" direction the architecture doc calls out.

### 5.5 — Use the `status` lifecycle that already exists
`potlucks.status` (`draft/active/completed/archived`) is defined and typed but everything is hard‑coded `active`. The verification feature is inherently post‑event, so the product wants a lifecycle: `active → completed` (unlocks verification UI, sends "rate your contributions" nudges) → `archived` (hidden from feeds). Wire it.

### 5.6 — Consolidate the migration churn
Migrations 008→009→010 are a visible "fix the RLS recursion we just created" loop, and 012 re‑drops/recreates half the policies to add co‑hosts. For production, **squash** into a coherent baseline schema + policy file so the security model is auditable in one place rather than reconstructed across 12 diffs. Keep the historical migrations for deployed environments, but maintain a single `schema.sql` source of truth.

---

## 6. Code quality, junk & spaghetti cleanup

### 6.1 — The 1018‑line manage page
`p/[slug]/manage/page.tsx` is one component with ~30 `useState` hooks and four inline tabs. Split into `OverviewTab`, `InvitesTab`, `CohostsTab`, `VerifyTab` + a `usePotluckManage(slug)` data hook. This single change removes most of the duplication noted below and makes the access‑control gate testable.

### 6.2 — Duplication to extract
- **Two near‑identical email builders** (`buildInviteEmail`, `buildCohostInviteEmail`) and two near‑identical "split emails → validate → insert → send via Resend" handlers across `invite/route.ts` and `cohosts/route.ts`. Extract a shared `sendBrandedEmail()` + a base HTML template.
- **The route preamble** "await params → createClient → getUser → 401 → load potluck → isHostOrCohost → 403" is copy‑pasted in 5 routes. Extract `withPotluckManageAuth(handler)`.
- **Stats grid** markup duplicated between `profile/page.tsx` and `profile/[id]/page.tsx`.
- **Verify row markup** duplicated for claims vs offers in `verification-panel.tsx`.

### 6.3 — Type holes
Numerous `as any` casts hide schema/relationship drift: `manage/page.tsx:706`, `verification-panel.tsx:184`, `invite/[code]/page.tsx:29`, `cohost-invite/[code]/page.tsx:24`, and the `any[]` initializers in `page.tsx`/`p/[slug]/page.tsx`. Generate proper join types (or use `supabase gen types` + typed `.select()` helpers) so `(offer as any).profile` becomes typed.

### 6.4 — Dead code / loose ends
- Unused `Separator` import in `manage/page.tsx`.
- `offer-form.tsx` modal `onSubmit` params dead (§4.10).
- `attendingOnly` computed twice in `my-potlucks-section.tsx`.
- `catch (err)` with unused `err` in several components (will be flagged once ESLint is on).

### 6.5 — Tooling gaps
- **No ESLint config** despite a `lint` script — add `.eslintrc.json` extending `next/core-web-vitals`.
- **No Prettier**, no editorconfig.
- **No CI** (the implementation plan's Phase 0 promised it).
- `next.config.mjs` has no security headers, no `productionBrowserSourceMaps:false`, no explicit `poweredByHeader:false`.

---

## 7. Accessibility (PRD requires WCAG 2.1 AA — currently failing)

Concrete, fixable failures:

- **Icon‑only buttons with no accessible name** (screen reader reads nothing): avatar upload + name edit/save (`profile/page.tsx:192,228,241`), grip/delete (`needs-builder.tsx:71,128`), verify toggles (`verification-panel.tsx:133,169`), banner remove (`banner-upload.tsx:61`), mobile "+" and avatar menu (`navbar.tsx:38,45`), copy/view header buttons (`manage/page.tsx:401`). → add `aria-label`.
- **Tabs are not ARIA tabs** (`manage/page.tsx:454`, `my-potlucks-section.tsx:90`): no `role="tablist"/"tab"/"tabpanel"`, no `aria-selected`, no arrow‑key nav.
- **Access‑level picker is not a radiogroup** (`create/page.tsx:232`): three buttons with selection conveyed by **color only** — fails 1.4.1 (use of color) and lacks `role="radio"`/`aria-checked`.
- **Unlabeled inputs** (placeholder ≠ label): qty/points (`needs-builder.tsx`), offer name/desc (`offer-form.tsx:117`), offer points (`verification-panel.tsx:189`), emoji search (`emoji-picker.tsx:255`), homepage/my‑potluck search.
- **Color‑only verified state** (`verification-panel.tsx:137`): the same check icon shows in both states; verified vs not is green‑vs‑grey only. Add a text/`aria-pressed` cue.
- **Non‑focusable dropzone** (`banner-upload.tsx:72`): a clickable `<div>` with no `role`/`tabindex`/keyboard handler — keyboard users can't upload.
- **Emoji grid** (`emoji-picker.tsx`): hundreds of unlabeled buttons, no roving `role="grid"` focus; brutal to keyboard/AT users.
- **Bare glyph semantics**: `✓` for verified (`needs-list.tsx:70`) with no "verified" text.
- **No focus management** when switching tabs or entering edit mode; **error banners not announced** (`auth/login` error has no `role="alert"`).
- **No skip‑to‑content link**; verify heading order globally.

A11y is a stated AA requirement; today the app would not pass an automated axe scan, let alone manual AT testing. Budget a dedicated pass.

---

## 8. Mobile / responsive

Generally strong (mobile‑first Tailwind, `Drawer` vs `Dialog` switch in the emoji picker is genuinely good, 44px tap targets there). Gaps:

- **Need reordering is impossible on mobile** — the grip is `hidden sm:block` and there's no reorder on the manage page at all (§2).
- **Manage page tab bar** can overflow at ~320px (four tabs + icons + count badges, no `overflow-x-auto`).
- `useIsMobile` in the emoji picker flips after mount → a brief Dialog↔Drawer swap / SSR mismatch flash.
- Banners use `<img>` not `next/image` (`potluck-card.tsx:21`, `potluck-detail-client.tsx:122`) → unoptimized payloads on phones, hurting the 3G target.

---

## 9. Testing & CI (currently zero)

There is **no test framework, no tests, and no CI** — the biggest single gap for "production ready." Recommended stack and the *first* tests to write (highest risk first):

1. **RLS policy tests (pgTAP or a seeded integration harness).** These are the most important tests in this codebase. Assert, against a real Postgres:
   - anon **cannot** `select guest_email` from `claims`/`rsvps`;
   - anon **cannot** `select` from `invites`/`cohost_invites`;
   - anon **cannot** insert a claim on an `invite_only` potluck;
   - a user **cannot** insert a claim with another user's `profile_id`;
   - a guest **cannot** delete another guest's claim;
   - claiming beyond `quantity` is rejected.
   Each of these maps directly to a §3 finding and would have caught them.
2. **Vitest unit tests** for `utils.ts` (slug, date formatting, `getClaimProgress` divide‑by‑zero), `safeRedirect`, the email escaper.
3. **Playwright E2E** for the two PRD success metrics: "host creates + shares a potluck in <2 min" and "guest claims a need in <30s, no account," plus the verify→points loop. These double as the cross‑device manual testing the original request wanted — run them against mobile viewports.
4. **GitHub Actions CI:** `tsc --noEmit`, `eslint`, `vitest`, `playwright`, and `supabase db lint` on every PR.

Minimal CI skeleton:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run test
```

---

## 10. Prioritized roadmap

**P0 — security & correctness (block production):**
1. Rewrite RLS: revoke world‑readable selects on `invites`/`cohost_invites`/`claims.guest_email`/`rsvps.guest_email`; add `can_view_potluck`/`can_manage_potluck` helpers (§3.1, §3.2).
2. Move all participant writes server‑side with access + capacity + `open_offers` enforcement and the `create_claim` RPC (§3.3).
3. Close identity spoofing: `profile_id = auth.uid()` check + guest capability tokens; fixes the §4.1 silent unclaim too (§3.4).
4. Make invite acceptance an authenticated POST; stop the GET side‑effect (§3.2).
5. Fix the open redirect (§3.5).
6. Escape email HTML (§3.7).
7. Delete `createServiceClient`; rename/centralize the admin client (§3.6).
8. Add rate limiting (Upstash/Vercel KV) to all public write routes.
9. Write the RLS test suite (§9) and stand up CI.

**P1 — PRD completeness & robustness:**
10. Real drag‑and‑drop reorder (`@dnd-kit/sortable`) usable on touch (§2).
11. Notifications: email host on claim, email participant on verify (§5.9) — use the `guest_email` you already collect.
12. Points ledger + reverse points on unverify/delete (§5.4).
13. Incremental realtime updates instead of full refetch (§4.5).
14. Timezone column + centralized formatting (§4.8).
15. Fix verification stale state (§4.2), null‑description crash (§4.3), banner silent‑drop (§4.4), co‑host false positive (§4.9).
16. Accessibility pass to AA (§7).

**P2 — polish & maintainability:**
17. Split the manage page; extract route‑auth + email helpers; kill `any` casts (§6).
18. ESLint + Prettier + security headers/CSP.
19. `next/image` for banners; emoji search coverage; pagination guards.
20. Squash migrations into an auditable baseline (§5.6); wire the `status` lifecycle (§5.5).

---

## Appendix — file‑level index of findings

| File | Findings |
|---|---|
| `supabase/migrations/003,004,011,012` | §3.1, §3.2, §3.3, §3.4, §4.1 (RLS) |
| `lib/supabase/server.ts` | §3.6 |
| `app/auth/login/page.tsx`, `auth/callback/route.ts` | §3.5 |
| `app/invite/[code]/page.tsx` | §3.2 (GET side‑effect) |
| `app/cohost-invite/[code]/cohost-invite-client.tsx` | §4.9 |
| `api/potlucks/[slug]/invite/route.ts`, `cohosts/route.ts` | §3.7, §6.2 |
| `api/potlucks/route.ts` | §3.8 (slug), §6.2 |
| `components/claim-button.tsx`, `rsvp-section.tsx`, `offer-form.tsx` | §3.3, §3.4, §4.1, §4.10 |
| `components/needs-builder.tsx` | §2 (DnD), §7 |
| `components/verification-panel.tsx` | §4.2, §7 |
| `components/banner-upload.tsx` | §4.7, §7 |
| `components/my-potlucks-section.tsx` | §4.3 |
| `app/p/[slug]/page.tsx`, `hooks/use-realtime-claims.ts` | §3.2, §4.5 |
| `app/p/[slug]/manage/page.tsx` | §6.1, §6.2, §7, §8 |
| `lib/utils.ts` + 4 call sites | §4.8 |
| project root | §6.5 (no ESLint/CI), §9 (no tests) |
