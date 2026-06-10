import { notFound } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NEEDS_WITH_CLAIMS_SELECT, OFFERS_SELECT, RSVPS_SELECT } from "@/lib/db-columns";
import { parseEventDate } from "@/lib/utils";
import { PotluckDetailClient } from "./potluck-detail-client";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const supabase = await createClient();
    const { data: potluck } = await supabase
      .from("potlucks")
      .select("title, description, banner_url, event_date, location")
      .eq("slug", slug)
      .single();

    if (!potluck) return { title: "Potluck Not Found" };

    const date = parseEventDate(potluck.event_date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const desc = potluck.description
      ? `${potluck.description} — ${date} · ${potluck.location}`
      : `${date} · ${potluck.location}`;

    return {
      title: potluck.title,
      description: desc,
      openGraph: {
        title: potluck.title,
        description: desc,
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: potluck.title,
        description: desc,
      },
    };
  } catch {
    return { title: "Potluck" };
  }
}

export default async function PotluckPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const inviteCode = typeof sp.invite === "string" ? sp.invite : undefined;

  let potluck = null;
  let needs: any[] = [];
  let offers: any[] = [];
  let rsvps: any[] = [];
  let host = null;
  let cohosts: any[] = [];

  try {
    const supabase = await createClient();

    let potluckData: any = null;
    let error: any = null;

    const result = await supabase
      .from("potlucks")
      .select("*")
      .eq("slug", slug)
      .single();

    potluckData = result.data;
    error = result.error;

    if ((error || !potluckData) && inviteCode) {
      const serviceClient = createServiceRoleClient();
      const inviteCheck = await serviceClient
        .from("invites")
        .select("potluck_id")
        .eq("code", inviteCode)
        .single();

      if (inviteCheck.data) {
        const fallback = await serviceClient
          .from("potlucks")
          .select("*")
          .eq("slug", slug)
          .single();

        if (fallback.data && fallback.data.id === inviteCheck.data.potluck_id) {
          potluckData = fallback.data;
          error = null;
        }
      }
    }

    if (error || !potluckData) return notFound();
    potluck = potluckData;

    const [needsRes, offersRes, hostRes, rsvpsRes, cohostsRes] = await Promise.all([
      supabase
        .from("needs")
        .select(NEEDS_WITH_CLAIMS_SELECT)
        .eq("potluck_id", potluck.id)
        .order("sort_order"),
      supabase
        .from("offers")
        .select(OFFERS_SELECT)
        .eq("potluck_id", potluck.id)
        .order("created_at"),
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", potluck.host_id)
        .single(),
      supabase
        .from("rsvps")
        .select(RSVPS_SELECT)
        .eq("potluck_id", potluck.id)
        .order("created_at"),
      supabase
        .from("cohosts")
        .select("*, profile:profiles(id, display_name, avatar_url)")
        .eq("potluck_id", potluck.id),
    ]);

    needs = needsRes.data || [];
    offers = offersRes.data || [];
    host = hostRes.data;
    rsvps = rsvpsRes.data || [];
    cohosts = cohostsRes.data || [];
  } catch {
    return notFound();
  }

  return (
    <PotluckDetailClient
      potluck={potluck}
      initialNeeds={needs}
      initialOffers={offers}
      initialRsvps={rsvps}
      host={host}
      cohosts={cohosts}
      inviteCode={inviteCode}
    />
  );
}
