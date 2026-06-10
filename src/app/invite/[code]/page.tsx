import { redirect, notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ code: string }>;
}

// Resolve an invite code to its potluck and redirect. This is a READ-ONLY
// landing page: it must not mark the invite accepted (a crawler / link-unfurl
// bot hitting this URL would otherwise silently "accept" it). Acceptance is
// bound to an authenticated user and happens on the potluck page / via the
// invite-accept route, keyed off the `?invite=` capability.
export default async function InvitePage({ params }: PageProps) {
  const { code } = await params;

  try {
    const service = createServiceRoleClient();
    const { data: invite, error } = await service
      .from("invites")
      .select("code, potlucks(slug)")
      .eq("code", code)
      .single();

    if (error || !invite || !invite.potlucks) return notFound();

    const potlucks = invite.potlucks as unknown as { slug: string } | { slug: string }[];
    const slug = Array.isArray(potlucks) ? potlucks[0]?.slug : potlucks?.slug;
    if (!slug) return notFound();
    redirect(`/p/${slug}?invite=${encodeURIComponent(code)}`);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: string }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return notFound();
  }
}
