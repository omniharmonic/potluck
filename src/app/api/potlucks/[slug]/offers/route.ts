import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { resolveWriteContext } from "@/lib/participant-api";
import { isHostOrCohost } from "@/lib/auth-helpers";

const CreateSchema = z.object({
  emoji: z.string().min(1).max(16).default("🎁"),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  guest_name: z.string().trim().min(1).max(80).optional(),
});

const DeleteSchema = z.object({
  offer_id: z.string().uuid(),
  guest_token: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const resolved = await resolveWriteContext(request, slug, "offer");
    if (!resolved.ok) return resolved.response;
    const { user, potluck, service } = resolved.ctx;

    if (!potluck.open_offers) {
      return NextResponse.json(
        { error: "Open offers are disabled for this potluck." },
        { status: 403 }
      );
    }

    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    const body = parsed.data;

    const isGuest = !user;
    if (isGuest && !body.guest_name) {
      return NextResponse.json({ error: "A name is required" }, { status: 400 });
    }
    const guestToken = isGuest ? nanoid(24) : null;

    const { data, error } = await service
      .from("offers")
      .insert({
        potluck_id: potluck.id,
        profile_id: user?.id ?? null,
        guest_name: isGuest ? body.guest_name : null,
        guest_token: guestToken,
        emoji: body.emoji,
        name: body.name,
        description: body.description ?? null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to add offer." }, { status: 500 });
    }
    return NextResponse.json({ offer_id: data.id, guest_token: guestToken });
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
    const resolved = await resolveWriteContext(request, slug, "offer");
    if (!resolved.ok) return resolved.response;
    const { user, potluck, service } = resolved.ctx;

    const parsed = DeleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { data: offer } = await service
      .from("offers")
      .select("id, profile_id, guest_token")
      .eq("id", parsed.data.offer_id)
      .eq("potluck_id", potluck.id)
      .single();

    if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = !!user && offer.profile_id === user.id;
    const isManager = !!user && (await isHostOrCohost(service, potluck.id, user.id));
    const hasToken =
      !!offer.guest_token && parsed.data.guest_token === offer.guest_token;

    if (!isOwner && !isManager && !hasToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await service.from("offers").delete().eq("id", offer.id);
    if (error) return NextResponse.json({ error: "Failed to remove offer." }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
