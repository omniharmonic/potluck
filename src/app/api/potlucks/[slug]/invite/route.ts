import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isHostOrCohost } from "@/lib/auth-helpers";
import { nanoid } from "nanoid";
import { Resend } from "resend";
import { z } from "zod";

const InviteSchema = z.object({
  emails: z.array(z.string().email()),
});

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function buildInviteEmail(params: {
  potluckTitle: string;
  hostName: string;
  eventDate: string;
  location: string;
  description: string;
  inviteLink: string;
}) {
  const { potluckTitle, hostName, eventDate, location, description, inviteLink } = params;

  const cleaned = eventDate.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "");
  const dateStr = new Date(cleaned).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Potluck Invitation - ${potluckTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9f6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f6f0">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden">
          <tr>
            <td style="background-color:#4a7c59;padding:28px 24px;text-align:center">
              <p style="font-size:40px;margin:0 0 4px 0;line-height:1">&#127858;</p>
              <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700">You're Invited to a Potluck</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <p style="color:#333333;font-size:15px;line-height:1.6;margin:0 0 16px 0">
                ${hostName} has invited you to:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f6f0;border-radius:8px">
                <tr>
                  <td style="padding:16px">
                    <p style="color:#333333;margin:0 0 8px 0;font-size:17px;font-weight:600">${potluckTitle}</p>
                    <p style="color:#555555;margin:0 0 4px 0;font-size:14px">Date: ${dateStr}</p>
                    <p style="color:#555555;margin:0;font-size:14px">Location: ${location}</p>
                    ${description ? `<p style="color:#666666;margin:10px 0 0 0;font-size:13px">${description}</p>` : ""}
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:24px 0 8px 0">
                    <a href="${inviteLink}" style="display:inline-block;background-color:#4a7c59;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px">View Potluck &amp; RSVP</a>
                  </td>
                </tr>
              </table>
              <p style="color:#888888;font-size:12px;text-align:center;margin:12px 0 0 0;line-height:1.5">
                See what's needed and claim what you'll bring.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px 24px;text-align:center">
              <p style="color:#aaaaaa;font-size:11px;margin:0;border-top:1px solid #eeeeee;padding-top:16px;line-height:1.5">
                This email was sent by <a href="https://www.potluck.exchange" style="color:#4a7c59;text-decoration:underline">Potluck</a> on behalf of ${hostName}.<br>
                If you did not expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `You're invited to a potluck!`,
    ``,
    `${hostName} has invited you to: ${potluckTitle}`,
    ``,
    `Date: ${dateStr}`,
    `Location: ${location}`,
    description ? `\n${description}` : "",
    ``,
    `View the potluck and RSVP here:`,
    inviteLink,
    ``,
    `See what's needed and claim what you'll bring.`,
    ``,
    `---`,
    `Sent via Potluck (https://www.potluck.exchange)`,
    `If you did not expect this invitation, you can safely ignore this email.`,
  ].filter(Boolean).join("\n");

  return { html, text };
}

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
    const parsed = InviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data" },
        { status: 400 }
      );
    }

    const { data: hostProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const hostName = hostProfile?.display_name || "Someone";

    const invites = parsed.data.emails.map((email) => ({
      potluck_id: potluck.id,
      email,
      code: nanoid(8),
    }));

    const { data, error } = await supabase
      .from("invites")
      .insert(invites)
      .select();

    if (error) {
      return NextResponse.json(
        { error: "Failed to create invites" },
        { status: 500 }
      );
    }

    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || "www.potluck.exchange";
    const baseUrl = `${proto}://${host}`;
    const inviteLinks = (data || []).map((inv) => ({
      email: inv.email,
      code: inv.code,
      link: `${baseUrl}/invite/${inv.code}`,
    }));

    let emailsSent = 0;
    if (resend) {
      const fromAddress = process.env.RESEND_FROM_EMAIL || "Potluck <invites@potluck.exchange>";

      const emailPromises = inviteLinks.map((inv) => {
        const { html, text } = buildInviteEmail({
          potluckTitle: potluck.title,
          hostName,
          eventDate: potluck.event_date,
          location: potluck.location,
          description: potluck.description,
          inviteLink: inv.link,
        });

        return resend.emails.send({
          from: fromAddress,
          to: inv.email,
          replyTo: user.email || undefined,
          subject: `${hostName} invited you to ${potluck.title}`,
          html,
          text,
          headers: {
            "X-Entity-Ref-ID": inv.code,
          },
        }).catch(() => null);
      });

      const results = await Promise.all(emailPromises);
      emailsSent = results.filter(Boolean).length;
    }

    return NextResponse.json({
      invites: inviteLinks,
      emailsSent,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
