import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { resolveWriteContext } from "@/lib/participant-api";
import { isHostOrCohost } from "@/lib/auth-helpers";

const CreateSchema = z.object({
  guest_name: z.string().trim().min(1).max(80).optional(),
  guest_email: z.string().email().max(200).optional(),
});

const DeleteSchema = z.object({
  rsvp_id: z.string().uuid(),
  guest_token: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const resolved = await resolveWriteContext(request, slug, "rsvp");
    if (!resolved.ok) return resolved.response;
    const { user, potluck, service } = resolved.ctx;

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
      .from("rsvps")
      .insert({
        potluck_id: potluck.id,
        profile_id: user?.id ?? null,
        guest_name: isGuest ? body.guest_name : null,
        guest_email: isGuest ? body.guest_email ?? null : null,
        guest_token: guestToken,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "You've already RSVP'd.", duplicate: true }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to RSVP." }, { status: 500 });
    }
    return NextResponse.json({ rsvp_id: data.id, guest_token: guestToken });
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
    const resolved = await resolveWriteContext(request, slug, "rsvp");
    if (!resolved.ok) return resolved.response;
    const { user, potluck, service } = resolved.ctx;

    const parsed = DeleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { data: rsvp } = await service
      .from("rsvps")
      .select("id, profile_id, guest_token")
      .eq("id", parsed.data.rsvp_id)
      .eq("potluck_id", potluck.id)
      .single();

    if (!rsvp) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = !!user && rsvp.profile_id === user.id;
    const isManager = !!user && (await isHostOrCohost(service, potluck.id, user.id));
    const hasToken =
      !!rsvp.guest_token && parsed.data.guest_token === rsvp.guest_token;

    if (!isOwner && !isManager && !hasToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await service.from("rsvps").delete().eq("id", rsvp.id);
    if (error) return NextResponse.json({ error: "Failed to cancel RSVP." }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
