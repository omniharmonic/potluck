import { notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CohostInviteClient } from "./cohost-invite-client";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function CohostInvitePage({ params }: PageProps) {
  const { code } = await params;

  try {
    const serviceClient = await createServiceClient();

    // Look up the invite with potluck and host details (bypasses RLS)
    const { data: invite, error } = await serviceClient
      .from("cohost_invites")
      .select("*, potlucks(slug, title, event_date, location, host_id)")
      .eq("code", code)
      .single();

    if (error || !invite || !invite.potlucks) return notFound();

    const potluck = invite.potlucks as any;

    // Get host name
    const { data: hostProfile } = await serviceClient
      .from("profiles")
      .select("display_name")
      .eq("id", potluck.host_id)
      .single();

    // Check if the current user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Check if already a co-host (only if authenticated)
    let alreadyCohost = false;
    if (user) {
      const { data: existing } = await serviceClient
        .from("cohosts")
        .select("id")
        .eq("potluck_id", invite.potluck_id)
        .eq("profile_id", user.id)
        .single();
      alreadyCohost = !!existing;
    }

    return (
      <CohostInviteClient
        code={code}
        potluckTitle={potluck.title}
        potluckSlug={potluck.slug}
        eventDate={potluck.event_date}
        location={potluck.location}
        hostName={hostProfile?.display_name || "Someone"}
        inviteAccepted={invite.accepted}
        alreadyCohost={alreadyCohost}
        isAuthenticated={!!user}
      />
    );
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err;
    return notFound();
  }
}
