// Shared server-side helpers for participant write routes
// (claims / offers / rsvps). Centralizes auth, access checks, and rate
// limiting so the individual routes stay thin and consistent.

import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WriteContext {
  user: { id: string } | null;
  potluck: {
    id: string;
    slug: string;
    access_level: string;
    open_offers: boolean;
    points_enabled: boolean;
  };
  service: SupabaseClient;
}

type Resolved =
  | { ok: true; ctx: WriteContext }
  | { ok: false; response: NextResponse };

/**
 * Loads the potluck for a participant write, verifies the caller can VIEW it
 * (so invite-only potlucks aren't writable by outsiders), and rate-limits the
 * request. Returns a ready-to-use context or an error response.
 */
export async function resolveWriteContext(
  request: Request,
  slug: string,
  action: string
): Promise<Resolved> {
  const ip = getClientIp(request);
  const rl = rateLimit(`${action}:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = createServiceRoleClient();
  const { data: potluck } = await service
    .from("potlucks")
    .select("id, slug, access_level, open_offers, points_enabled")
    .eq("slug", slug)
    .single();

  if (!potluck) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  // Access check: public/link_shared are open; otherwise the user must be able
  // to view it (host, co-host, or accepted invite) per can_view_potluck.
  let canView = potluck.access_level === "public" || potluck.access_level === "link_shared";
  if (!canView) {
    const { data } = await supabase.rpc("can_view_potluck", { p_id: potluck.id });
    canView = data === true;
  }
  if (!canView) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, ctx: { user: user ? { id: user.id } : null, potluck, service } };
}
