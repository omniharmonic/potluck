import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    // User must be authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin client truly bypasses RLS (no cookie-based auth)
    const adminClient = createAdminClient();
    const { data: invite, error: inviteError } = await adminClient
      .from("cohost_invites")
      .select("*, potlucks(slug, host_id)")
      .eq("code", code)
      .single();

    if (inviteError || !invite || !invite.potlucks) {
      return NextResponse.json(
        { error: "Invite not found", details: inviteError?.message },
        { status: 404 }
      );
    }

    const potluck = invite.potlucks as any;
    const potluckSlug = potluck.slug;

    // Already accepted — just return success
    if (invite.accepted) {
      return NextResponse.json({ slug: potluckSlug, alreadyAccepted: true });
    }

    // Check if user is already the host
    if (potluck.host_id === user.id) {
      await adminClient
        .from("cohost_invites")
        .update({ accepted: true })
        .eq("id", invite.id);
      return NextResponse.json({ slug: potluckSlug, alreadyHost: true });
    }

    // Check if already a co-host (maybeSingle returns null for 0 rows, no error)
    const { data: existing } = await adminClient
      .from("cohosts")
      .select("id")
      .eq("potluck_id", invite.potluck_id)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existing) {
      await adminClient
        .from("cohost_invites")
        .update({ accepted: true })
        .eq("id", invite.id);
      return NextResponse.json({ slug: potluckSlug, alreadyCohost: true });
    }

    // Insert as co-host and mark invite accepted
    const { error: insertError } = await adminClient
      .from("cohosts")
      .insert({ potluck_id: invite.potluck_id, profile_id: user.id });

    if (insertError) {
      console.error("Failed to insert co-host:", insertError);
      return NextResponse.json(
        { error: "Failed to accept invite", details: insertError.message },
        { status: 500 }
      );
    }

    await adminClient
      .from("cohost_invites")
      .update({ accepted: true })
      .eq("id", invite.id);

    return NextResponse.json({ slug: potluckSlug, accepted: true });
  } catch (err) {
    console.error("Co-host invite acceptance error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}
