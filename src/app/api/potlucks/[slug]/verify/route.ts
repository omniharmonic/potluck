import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isHostOrCohost } from "@/lib/auth-helpers";
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

    // Verify claims
    if (data.verified_claim_ids.length > 0) {
      const { data: claims } = await serviceClient
        .from("claims")
        .select()
        .in("id", data.verified_claim_ids);

      const needIds = (claims || []).map((c) => c.need_id);
      const { data: relatedNeeds } = await serviceClient
        .from("needs")
        .select()
        .in("id", needIds);

      const needMap = new Map((relatedNeeds || []).map((n) => [n.id, n]));

      for (const claim of claims || []) {
        const need = needMap.get(claim.need_id);
        const pointValue =
          potluck.points_enabled && need?.point_value
            ? need.point_value
            : 0;

        await serviceClient
          .from("claims")
          .update({
            verified: true,
            points_awarded: pointValue,
          })
          .eq("id", claim.id);

        if (pointValue > 0 && claim.profile_id) {
          await serviceClient.rpc("increment_points", {
            user_id: claim.profile_id,
            amount: pointValue,
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
        .eq("verified", true);

      for (const claim of claims || []) {
        if (claim.points_awarded > 0 && claim.profile_id) {
          await serviceClient.rpc("increment_points", {
            user_id: claim.profile_id,
            amount: -claim.points_awarded,
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
        .in("id", data.verified_offer_ids);

      for (const offer of offersToVerify || []) {
        const pointValue =
          potluck.points_enabled && data.offer_points?.[offer.id]
            ? data.offer_points[offer.id]
            : 0;
        const prevPoints = offer.points_awarded || 0;
        const pointsDelta = pointValue - prevPoints;

        await serviceClient
          .from("offers")
          .update({ verified: true, points_awarded: pointValue })
          .eq("id", offer.id);

        if (pointsDelta !== 0 && offer.profile_id) {
          await serviceClient.rpc("increment_points", {
            user_id: offer.profile_id,
            amount: pointsDelta,
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
        .eq("verified", true);

      for (const offer of offersToUnverify || []) {
        if ((offer.points_awarded || 0) > 0 && offer.profile_id) {
          await serviceClient.rpc("increment_points", {
            user_id: offer.profile_id,
            amount: -(offer.points_awarded || 0),
          });
        }

        await serviceClient
          .from("offers")
          .update({ verified: false, points_awarded: 0 })
          .eq("id", offer.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
