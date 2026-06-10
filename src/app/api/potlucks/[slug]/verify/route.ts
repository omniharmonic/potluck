import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isHostOrCohost } from "@/lib/auth-helpers";
import { notifyContributionVerified } from "@/lib/notifications";
import { z } from "zod";

const VerifySchema = z.object({
  verified_claim_ids: z.array(z.string()),
  verified_offer_ids: z.array(z.string()),
  unverified_claim_ids: z.array(z.string()),
  unverified_offer_ids: z.array(z.string()),
  offer_points: z.record(z.string(), z.number()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: potluck } = await supabase
      .from("potlucks")
      .select()
      .eq("slug", slug)
      .single();

    if (!potluck || !(await isHostOrCohost(supabase, potluck.id, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = VerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const serviceClient = createServiceRoleClient();

    // Collect participants who become newly verified, to email afterwards.
    const newlyVerified: {
      profileId: string | null;
      guestEmail: string | null;
      contributorName: string;
      itemName: string;
      points: number;
    }[] = [];

    // Verify claims
    if (data.verified_claim_ids.length > 0) {
      const { data: claims } = await serviceClient
        .from("claims")
        .select()
        .in("id", data.verified_claim_ids)
        .eq("potluck_id", potluck.id); // scope: ignore ids from other potlucks (IDOR)

      const needIds = (claims || []).map((c) => c.need_id);
      const { data: relatedNeeds } = await serviceClient
        .from("needs")
        .select()
        .in("id", needIds);

      const needMap = new Map((relatedNeeds || []).map((n) => [n.id, n]));

      for (const claim of claims || []) {
        const need = needMap.get(claim.need_id);
        const pointValue =
          potluck.points_enabled && need?.point_value ? need.point_value : 0;

        if (!claim.verified) {
          newlyVerified.push({
            profileId: claim.profile_id,
            guestEmail: claim.guest_email,
            contributorName: claim.guest_name || "there",
            itemName: need?.name || "your item",
            points: pointValue,
          });
        }

        await serviceClient
          .from("claims")
          .update({ verified: true, points_awarded: pointValue })
          .eq("id", claim.id);

        // Idempotent: the ledger reconciles any previous award for this claim.
        if (claim.profile_id) {
          await serviceClient.rpc("set_points", {
            p_profile: claim.profile_id,
            p_source_type: "claim",
            p_source_id: claim.id,
            p_points: pointValue,
          });
        }
      }
    }

    // Unverify claims
    if (data.unverified_claim_ids.length > 0) {
      const { data: claims } = await serviceClient
        .from("claims")
        .select()
        .in("id", data.unverified_claim_ids)
        .eq("potluck_id", potluck.id)
        .eq("verified", true);

      for (const claim of claims || []) {
        if (claim.profile_id) {
          await serviceClient.rpc("set_points", {
            p_profile: claim.profile_id,
            p_source_type: "claim",
            p_source_id: claim.id,
            p_points: 0,
          });
        }
        await serviceClient
          .from("claims")
          .update({ verified: false, points_awarded: 0 })
          .eq("id", claim.id);
      }
    }

    // Verify offers (with optional points)
    if (data.verified_offer_ids.length > 0) {
      const { data: offersToVerify } = await serviceClient
        .from("offers")
        .select()
        .in("id", data.verified_offer_ids)
        .eq("potluck_id", potluck.id);

      for (const offer of offersToVerify || []) {
        const pointValue =
          potluck.points_enabled && data.offer_points?.[offer.id]
            ? data.offer_points[offer.id]
            : 0;

        if (!offer.verified) {
          newlyVerified.push({
            profileId: offer.profile_id,
            guestEmail: null, // offers table has no guest_email column
            contributorName: offer.guest_name || "there",
            itemName: offer.name || "your offer",
            points: pointValue,
          });
        }

        await serviceClient
          .from("offers")
          .update({ verified: true, points_awarded: pointValue })
          .eq("id", offer.id);

        if (offer.profile_id) {
          await serviceClient.rpc("set_points", {
            p_profile: offer.profile_id,
            p_source_type: "offer",
            p_source_id: offer.id,
            p_points: pointValue,
          });
        }
      }
    }

    // Unverify offers
    if (data.unverified_offer_ids.length > 0) {
      const { data: offersToUnverify } = await serviceClient
        .from("offers")
        .select()
        .in("id", data.unverified_offer_ids)
        .eq("potluck_id", potluck.id)
        .eq("verified", true);

      for (const offer of offersToUnverify || []) {
        if (offer.profile_id) {
          await serviceClient.rpc("set_points", {
            p_profile: offer.profile_id,
            p_source_type: "offer",
            p_source_id: offer.id,
            p_points: 0,
          });
        }
        await serviceClient
          .from("offers")
          .update({ verified: false, points_awarded: 0 })
          .eq("id", offer.id);
      }
    }

    // Best-effort verification emails to newly-verified participants.
    try {
      await Promise.all(
        newlyVerified.map(async (n) => {
          let to = n.guestEmail;
          if (!to && n.profileId) {
            const { data: u } = await serviceClient.auth.admin.getUserById(n.profileId);
            to = u.user?.email ?? null;
          }
          if (!to) return;
          await notifyContributionVerified({
            to,
            contributorName: n.contributorName,
            itemName: n.itemName,
            potluckTitle: potluck.title || "the potluck",
            potluckSlug: potluck.slug,
            points: n.points,
          });
        })
      );
    } catch {
      // ignore notification failures
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
