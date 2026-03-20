import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

    // Look up the invite (service client bypasses RLS)
    const serviceClient = await createServiceClient();
    const { data: invite, error } = await serviceClient
      .from("cohost_invites")
      .select("*, potlucks(slug)")
      .eq("code", code)
      .single();

    if (error || !invite || !invite.potlucks) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    const potluckSlug = (invite.potlucks as any).slug;

    // Already accepted — just return success
    if (invite.accepted) {
      return NextResponse.json({ slug: potluckSlug, alreadyAccepted: true });
    }

    // Check if user is already the host
    const { data: potluck } = await serviceClient
      .from("potlucks")
      .select("host_id")
      .eq("id", invite.potluck_id)
      .single();

    if (potluck?.host_id === user.id) {
      // Mark invite accepted but don't add to cohosts (already the host)
      await serviceClient
        .from("cohost_invites")
        .update({ accepted: true })
        .eq("id", invite.id);
      return NextResponse.json({ slug: potluckSlug, alreadyHost: true });
    }

    // Check if already a co-host
    const { data: existing } = await serviceClient
      .from("cohosts")
      .select("id")
      .eq("potluck_id", invite.potluck_id)
      .eq("profile_id", user.id)
      .single();

    if (existing) {
      await serviceClient
        .from("cohost_invites")
        .update({ accepted: true })
        .eq("id", invite.id);
      return NextResponse.json({ slug: potluckSlug, alreadyCohost: true });
    }

    // Insert as co-host and mark invite accepted
    const { error: insertError } = await serviceClient
      .from("cohosts")
      .insert({ potluck_id: invite.potluck_id, profile_id: user.id });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to accept invite" },
        { status: 500 }
      );
    }

    await serviceClient
      .from("cohost_invites")
      .update({ accepted: true })
      .eq("id", invite.id);

    return NextResponse.json({ slug: potluckSlug, accepted: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
