import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { resolveWriteContext } from "@/lib/participant-api";
import { isHostOrCohost } from "@/lib/auth-helpers";
import { notifyHostOfClaim } from "@/lib/notifications";

const CreateSchema = z.object({
  need_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
  guest_name: z.string().trim().min(1).max(80).optional(),
  guest_email: z.string().email().max(200).optional(),
});

const DeleteSchema = z.object({
  claim_id: z.string().uuid(),
  guest_token: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const resolved = await resolveWriteContext(request, slug, "claim");
    if (!resolved.ok) return resolved.response;
    const { user, potluck, service } = resolved.ctx;

    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    const body = parsed.data;

    // Guests must supply a name; a fresh capability token proves ownership.
    const isGuest = !user;
    if (isGuest && !body.guest_name) {
      return NextResponse.json({ error: "A name is required" }, { status: 400 });
    }
    const guestToken = isGuest ? nanoid(24) : null;

    const { data, error } = await service.rpc("create_claim", {
      p_need_id: body.need_id,
      p_potluck_id: potluck.id,
      p_profile_id: user?.id ?? null,
      p_guest_name: isGuest ? body.guest_name : null,
      p_guest_email: isGuest ? body.guest_email ?? null : null,
      p_guest_token: guestToken,
      p_quantity: body.quantity,
    });

    if (error) {
      const msg = error.message || "";
      if (msg.includes("NEED_FULL")) {
        return NextResponse.json({ error: "This item is already fully claimed." }, { status: 409 });
      }
      if (msg.includes("NEED_NOT_FOUND") || msg.includes("NEED_POTLUCK_MISMATCH")) {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to claim." }, { status: 500 });
    }

    // Best-effort: notify the host. Don't block or fail the response on email.
    try {
      const [{ data: potluckRow }, { data: needRow }, claimerProfile] = await Promise.all([
        service.from("potlucks").select("host_id, title").eq("id", potluck.id).single(),
        service.from("needs").select("name").eq("id", body.need_id).single(),
        isGuest
          ? Promise.resolve(null)
          : service.from("profiles").select("display_name").eq("id", user!.id).single(),
      ]);
      if (potluckRow?.host_id) {
        await notifyHostOfClaim({
          service,
          hostId: potluckRow.host_id,
          claimerName: isGuest
            ? body.guest_name!
            : claimerProfile?.data?.display_name || "A member",
          needName: needRow?.name || "an item",
          potluckTitle: potluckRow.title || "your potluck",
          potluckSlug: potluck.slug,
        });
      }
    } catch {
      // ignore notification failures
    }

    return NextResponse.json({ claim: data, guest_token: guestToken });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const resolved = await resolveWriteContext(request, slug, "claim");
    if (!resolved.ok) return resolved.response;
    const { user, potluck, service } = resolved.ctx;

    const parsed = DeleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { data: claim } = await service
      .from("claims")
      .select("id, profile_id, guest_token, potluck_id")
      .eq("id", parsed.data.claim_id)
      .eq("potluck_id", potluck.id)
      .single();

    if (!claim) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Ownership: the authenticated owner, a host/co-host, or a guest holding
    // the matching capability token.
    const isOwner = !!user && claim.profile_id === user.id;
    const isManager = !!user && (await isHostOrCohost(service, potluck.id, user.id));
    const hasToken =
      !!claim.guest_token && parsed.data.guest_token === claim.guest_token;

    if (!isOwner && !isManager && !hasToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await service.from("claims").delete().eq("id", claim.id);
    if (error) {
      return NextResponse.json({ error: "Failed to unclaim." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
