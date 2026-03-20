import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isHostOrCohost } from "@/lib/auth-helpers";
import { z } from "zod";

const UpdatePotluckSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  event_date: z.string().optional(),
  location: z.string().min(1).optional(),
  access_level: z.enum(["invite_only", "link_shared", "public"]).optional(),
  open_offers: z.boolean().optional(),
  points_enabled: z.boolean().optional(),
  banner_url: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
});

export async function PATCH(
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

    if (!potluck) {
      return NextResponse.json(
        { error: "Potluck not found" },
        { status: 404 }
      );
    }

    if (!(await isHostOrCohost(supabase, potluck.id, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = UpdatePotluckSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("potlucks")
      .update(parsed.data)
      .eq("id", potluck.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
