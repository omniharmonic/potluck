import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// Accept an invite. Requires authentication and binds acceptance to the
// invited email address, so a leaked/guessed code alone cannot grant a
// different account access. Marking `accepted = true` is what unlocks the
// `has_accepted_invite` RLS path for future visits.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceRoleClient();
    const { data: invite } = await service
      .from("invites")
      .select("id, email, accepted, potlucks(slug)")
      .eq("code", code)
      .single();

    if (!invite || !invite.potlucks) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    const potlucks = invite.potlucks as unknown as { slug: string } | { slug: string }[];
    const slug = Array.isArray(potlucks) ? potlucks[0]?.slug : potlucks?.slug;

    // Bind acceptance to the invited email (case-insensitive).
    if (
      user.email &&
      invite.email &&
      user.email.toLowerCase() !== invite.email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "This invite was sent to a different email address.", slug },
        { status: 403 }
      );
    }

    if (!invite.accepted) {
      await service.from("invites").update({ accepted: true }).eq("id", invite.id);
    }

    return NextResponse.json({ slug, accepted: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
