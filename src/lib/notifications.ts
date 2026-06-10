// Minimal transactional email notifications (PRD §5.9). No-ops gracefully if
// RESEND_API_KEY is unset so local/dev and tests don't depend on email. All
// sends are best-effort and must never block or fail the originating request.

import { Resend } from "resend";
import { escapeHtml } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL || "Potluck <notifications@potluck.exchange>";
const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://www.potluck.exchange";

function shell(title: string, bodyHtml: string, ctaHref?: string, ctaLabel?: string) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f9f6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f0"><tr><td align="center" style="padding:40px 16px">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#4a7c59;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:18px">${escapeHtml(title)}</h1></td></tr>
  <tr><td style="padding:24px;color:#333;font-size:15px;line-height:1.6">${bodyHtml}
  ${ctaHref ? `<table role="presentation" width="100%"><tr><td align="center" style="padding:20px 0 4px"><a href="${ctaHref}" style="display:inline-block;background:#4a7c59;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600">${escapeHtml(ctaLabel || "View")}</a></td></tr></table>` : ""}
  </td></tr>
  <tr><td style="padding:0 24px 20px;text-align:center"><p style="color:#aaa;font-size:11px;border-top:1px solid #eee;padding-top:16px;margin:0">Sent by <a href="${SITE}" style="color:#4a7c59">Potluck</a></p></td></tr>
  </table></td></tr></table></body></html>`;
}

async function emailForProfile(service: SupabaseClient, profileId: string): Promise<string | null> {
  try {
    const { data } = await service.auth.admin.getUserById(profileId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Notify the host that someone claimed a need. */
export async function notifyHostOfClaim(params: {
  service: SupabaseClient;
  hostId: string;
  claimerName: string;
  needName: string;
  potluckTitle: string;
  potluckSlug: string;
}) {
  if (!resend) return;
  const to = await emailForProfile(params.service, params.hostId);
  if (!to) return;
  const link = `${SITE}/p/${params.potluckSlug}/manage`;
  const html = shell(
    "Someone claimed a need",
    `<p><strong>${escapeHtml(params.claimerName)}</strong> is bringing <strong>${escapeHtml(params.needName)}</strong> to <strong>${escapeHtml(params.potluckTitle)}</strong>.</p>`,
    link,
    "View your potluck"
  );
  await resend.emails
    .send({ from: FROM, to, subject: `${params.claimerName} claimed "${params.needName}"`, html })
    .catch(() => null);
}

/** Notify a participant that the host verified their contribution. */
export async function notifyContributionVerified(params: {
  to: string;
  contributorName: string;
  itemName: string;
  potluckTitle: string;
  potluckSlug: string;
  points: number;
}) {
  if (!resend) return;
  const link = `${SITE}/p/${params.potluckSlug}`;
  const pts = params.points > 0 ? ` You earned <strong>${params.points} points</strong>.` : "";
  const html = shell(
    "Contribution verified ✓",
    `<p>Hi ${escapeHtml(params.contributorName)}, the host verified that you brought <strong>${escapeHtml(params.itemName)}</strong> to <strong>${escapeHtml(params.potluckTitle)}</strong>.${pts}</p>`,
    link,
    "View potluck"
  );
  await resend.emails
    .send({ from: FROM, to: params.to, subject: `Your contribution to "${params.potluckTitle}" was verified`, html })
    .catch(() => null);
}
