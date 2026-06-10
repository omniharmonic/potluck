import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isHostOrCohost } from "@/lib/auth-helpers";
import { nanoid } from "nanoid";
import { Resend } from "resend";
import { z } from "zod";
import { escapeHtml } from "@/lib/utils";

const InviteCohostSchema = z.object({
  emails: z.array(z.string().email()),
});

const RemoveCohostSchema = z.object({
  cohost_id: z.string().uuid().optional(),
  invite_id: z.string().uuid().optional(),
});

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function buildCohostInviteEmail(params: {
  potluckTitle: string;
  inviterName: string;
  inviteLink: string;
}) {
  const { inviteLink } = params;
  const potluckTitle = escapeHtml(params.potluckTitle);
  const inviterName = escapeHtml(params.inviterName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Co-Host Invitation - ${potluckTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9f6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f6f0">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden">
          <tr>
            <td style="background-color:#4a7c59;padding:28px 24px;text-align:center">
              <p style="font-size:40px;margin:0 0 4px 0;line-height:1">&#129309;</p>
              <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700">You're Invited to Co-Host</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <p style="color:#333333;font-size:15px;line-height:1.6;margin:0 0 16px 0">
                ${inviterName} has invited you to co-host <strong>${potluckTitle}</strong>.
              </p>
              <p style="color:#555555;font-size:14px;line-height:1.6;margin:0 0 16px 0">
                As a co-host, you'll be able to manage needs, verify contributions, send invites, and more.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:24px 0 8px 0">
                    <a href="${inviteLink}" style="display:inline-block;background-color:#4a7c59;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px">Accept &amp; Co-Host</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px 24px;text-align:center">
              <p style="color:#aaaaaa;font-size:11px;margin:0;border-top:1px solid #eeeeee;padding-top:16px;line-height:1.5">
                This email was sent by <a href="https://www.potluck.exchange" style="color:#4a7c59;text-decoration:underline">Potluck</a> on behalf of ${inviterName}.<br>
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
    `You're invited to co-host a potluck!`,
    ``,
    `${params.inviterName} has invited you to co-host "${params.potluckTitle}".`,
    ``,
    `As a co-host, you'll be able to manage needs, verify contributions, send invites, and more.`,
    ``,
    `Accept here: ${inviteLink}`,
    ``,
    `---`,
    `Sent via Potluck (https://www.potluck.exchange)`,
    `If you did not expect this invitation, you can safely ignore this email.`,
  ].join("\n");

  return { html, text };
}

export async function GET(
  _request: Request,
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!(await isHostOrCohost(supabase, potluck.id, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [cohostsRes, invitesRes] = await Promise.all([
      supabase
        .from("cohosts")
        .select("*, profile:profiles(id, display_name, avatar_url)")
        .eq("potluck_id", potluck.id),
      supabase
        .from("cohost_invites")
        .select("*")
        .eq("potluck_id", potluck.id)
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      cohosts: cohostsRes.data || [],
      invites: invitesRes.data || [],
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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

    if (!potluck) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!(await isHostOrCohost(supabase, potluck.id, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = InviteCohostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const inviterName = inviterProfile?.display_name || "Someone";

    const invites = parsed.data.emails.map((email) => ({
      potluck_id: potluck.id,
      email: email.toLowerCase(),
      code: nanoid(8),
    }));

    const { data, error } = await supabase
      .from("cohost_invites")
      .insert(invites)
      .select();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "One or more emails have already been invited as co-hosts." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to create co-host invites" },
        { status: 500 }
      );
    }

    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || "www.potluck.exchange";
    const baseUrl = `${proto}://${host}`;

    let emailsSent = 0;
    if (resend && data) {
      const fromAddress =
        process.env.RESEND_FROM_EMAIL || "Potluck <invites@potluck.exchange>";

      const emailPromises = data.map((inv) => {
        const inviteLink = `${baseUrl}/cohost-invite/${inv.code}`;
        const { html, text } = buildCohostInviteEmail({
          potluckTitle: potluck.title,
          inviterName,
          inviteLink,
        });

        return resend.emails
          .send({
            from: fromAddress,
            to: inv.email,
            replyTo: user.email || undefined,
            subject: `${inviterName} invited you to co-host ${potluck.title}`,
            html,
            text,
            headers: { "X-Entity-Ref-ID": inv.code },
          })
          .catch(() => null);
      });

      const results = await Promise.all(emailPromises);
      emailsSent = results.filter(Boolean).length;
    }

    return NextResponse.json({
      invites: data || [],
      emailsSent,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!(await isHostOrCohost(supabase, potluck.id, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = RemoveCohostSchema.safeParse(body);

    if (!parsed.success || (!parsed.data.cohost_id && !parsed.data.invite_id)) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    if (parsed.data.cohost_id) {
      const { error } = await supabase
        .from("cohosts")
        .delete()
        .eq("id", parsed.data.cohost_id)
        .eq("potluck_id", potluck.id);

      if (error) {
        return NextResponse.json(
          { error: "Failed to remove co-host" },
          { status: 500 }
        );
      }
    }

    if (parsed.data.invite_id) {
      const { error } = await supabase
        .from("cohost_invites")
        .delete()
        .eq("id", parsed.data.invite_id)
        .eq("potluck_id", potluck.id);

      if (error) {
        return NextResponse.json(
          { error: "Failed to remove co-host invite" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
