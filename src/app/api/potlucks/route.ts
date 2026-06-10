import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSlug } from "@/lib/utils";
import { z } from "zod";

const CreatePotluckSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  event_date: z.string(),
  location: z.string().min(1),
  access_level: z.enum(["invite_only", "link_shared", "public"]).default("link_shared"),
  open_offers: z.boolean().default(true),
  points_enabled: z.boolean().default(false),
  banner_url: z.string().nullable().optional(),
  needs: z.array(
    z.object({
      emoji: z.string(),
      name: z.string().min(1),
      quantity: z.number().int().min(1).default(1),
      point_value: z.number().int().nullable().optional(),
      sort_order: z.number().int().default(0),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreatePotluckSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Insert with a unique slug, retrying on the rare slug collision (23505).
    let potluck: { id: string; slug: string } | null = null;
    let potluckError: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = generateSlug(data.title);
      const result = await supabase
        .from("potlucks")
        .insert({
          host_id: user.id,
          title: data.title,
          description: data.description,
          event_date: data.event_date,
          location: data.location,
          access_level: data.access_level,
          open_offers: data.open_offers,
          points_enabled: data.points_enabled,
          banner_url: data.banner_url || null,
          slug,
          status: "active",
        })
        .select("id, slug")
        .single();

      if (!result.error) {
        potluck = result.data;
        break;
      }
      potluckError = result.error;
      if (result.error.code !== "23505") break; // not a slug conflict — stop
    }

    if (!potluck) {
      return NextResponse.json(
        { error: "Failed to create potluck", details: potluckError?.message },
        { status: 500 }
      );
    }

    if (data.needs.length > 0) {
      const needsToInsert = data.needs.map((need) => ({
        potluck_id: potluck.id,
        emoji: need.emoji,
        name: need.name,
        quantity: need.quantity,
        point_value: data.points_enabled ? need.point_value : null,
        sort_order: need.sort_order,
      }));

      const { error: needsError } = await supabase
        .from("needs")
        .insert(needsToInsert);

      if (needsError) {
        await supabase.from("potlucks").delete().eq("id", potluck.id);
        return NextResponse.json(
          { error: "Failed to create needs", details: needsError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ slug: potluck.slug, id: potluck.id });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
