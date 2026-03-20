import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function CohostInvitePage({ params }: PageProps) {
  const { code } = await params;

  try {
    const serviceClient = await createServiceClient();

    // Look up the invite (bypasses RLS)
    const { data: invite, error } = await serviceClient
      .from("cohost_invites")
      .select("*, potlucks(slug)")
      .eq("code", code)
      .single();

    if (error || !invite || !invite.potlucks) return notFound();

    const potluckSlug = (invite.potlucks as any).slug;

    // If already accepted, redirect to manage page
    if (invite.accepted) {
      redirect(`/p/${potluckSlug}/manage`);
    }

    // Check if user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Not logged in — redirect to login with return URL
      redirect(`/auth/login?redirect=/cohost-invite/${code}`);
    }

    // Check if already a co-host
    const { data: existing } = await serviceClient
      .from("cohosts")
      .select("id")
      .eq("potluck_id", invite.potluck_id)
      .eq("profile_id", user.id)
      .single();

    if (existing) {
      // Already a co-host, mark invite accepted and redirect
      await serviceClient
        .from("cohost_invites")
        .update({ accepted: true })
        .eq("id", invite.id);
      redirect(`/p/${potluckSlug}/manage`);
    }

    // Insert as co-host and mark invite accepted
    await serviceClient.from("cohosts").insert({
      potluck_id: invite.potluck_id,
      profile_id: user.id,
    });

    await serviceClient
      .from("cohost_invites")
      .update({ accepted: true })
      .eq("id", invite.id);

    redirect(`/p/${potluckSlug}/manage`);
  } catch (err: any) {
    // Next.js redirect throws a special error — re-throw it
    if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err;
    return notFound();
  }
}
