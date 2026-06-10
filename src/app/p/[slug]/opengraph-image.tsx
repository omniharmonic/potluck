import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { parseEventDate } from "@/lib/utils";

export const runtime = "edge";
export const alt = "Potluck";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let title = "Potluck";
  let description = "";
  let date = "";
  let location = "";
  let bannerUrl: string | null = null;
  let claimedCount = 0;
  let totalCount = 0;

  try {
    const supabase = await createClient();
    const { data: potluck } = await supabase
      .from("potlucks")
      .select("title, description, event_date, location, banner_url")
      .eq("slug", slug)
      .single();

    if (potluck) {
      title = potluck.title;
      description = potluck.description || "";
      bannerUrl = potluck.banner_url;
      location = potluck.location || "";
      date = parseEventDate(potluck.event_date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    const { data: needs } = await supabase
      .from("needs")
      .select("quantity, claimed_quantity")
      .eq(
        "potluck_id",
        (
          await supabase
            .from("potlucks")
            .select("id")
            .eq("slug", slug)
            .single()
        ).data?.id || ""
      );

    if (needs) {
      totalCount = needs.reduce((s, n) => s + n.quantity, 0);
      claimedCount = needs.reduce((s, n) => s + n.claimed_quantity, 0);
    }
  } catch {
    // fallback to defaults
  }

  const percentage = totalCount > 0 ? Math.round((claimedCount / totalCount) * 100) : 0;

  if (bannerUrl) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            position: "relative",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              padding: "48px 56px",
              background:
                "linear-gradient(transparent, rgba(0,0,0,0.7) 40%)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 48 }}>🍲</span>
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 800,
                  color: "white",
                  lineHeight: 1.1,
                }}
              >
                {title.length > 40 ? title.slice(0, 40) + "…" : title}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 32,
                fontSize: 22,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {date && <span>📅 {date}</span>}
              {location && (
                <span>📍 {location.length > 30 ? location.slice(0, 30) + "…" : location}</span>
              )}
              {totalCount > 0 && (
                <span>
                  ✅ {claimedCount}/{totalCount} claimed ({percentage}%)
                </span>
              )}
            </div>
          </div>
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #fdf6e3 0%, #f5ead0 50%, #e6c49e 100%)",
          fontFamily: "system-ui, sans-serif",
          padding: "56px",
        }}
      >
        <div style={{ fontSize: 88, marginBottom: 8 }}>🍲</div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#2d2015",
            textAlign: "center",
            lineHeight: 1.15,
            maxWidth: 900,
            marginBottom: 20,
          }}
        >
          {title.length > 50 ? title.slice(0, 50) + "…" : title}
        </div>
        {description && (
          <div
            style={{
              fontSize: 26,
              color: "#5c4a3a",
              textAlign: "center",
              maxWidth: 750,
              lineHeight: 1.4,
              marginBottom: 24,
            }}
          >
            {description.length > 100
              ? description.slice(0, 100) + "…"
              : description}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            fontSize: 22,
            color: "#8a7a6a",
          }}
        >
          {date && <span>📅 {date}</span>}
          {location && (
            <span>📍 {location.length > 30 ? location.slice(0, 30) + "…" : location}</span>
          )}
          {totalCount > 0 && (
            <span style={{ color: "#4a7c59", fontWeight: 600 }}>
              ✅ {percentage}% claimed
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 18,
            color: "#b0a090",
            marginTop: 32,
          }}
        >
          potluck.exchange
        </div>
      </div>
    ),
    { ...size }
  );
}
