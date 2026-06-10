import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { nanoid } from "nanoid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Only allow same-origin relative redirect targets. Anything that is an
 * absolute URL, protocol-relative (`//evil.com`), or not a path is rejected
 * in favour of the homepage. Prevents open-redirect phishing.
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}

/** Escape a string for safe interpolation into HTML (e.g. email templates). */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  // nanoid gives a collision-resistant, URL-safe suffix (Math.random is neither).
  const suffix = nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "");
  return base ? `${base}-${suffix}` : suffix;
}

export function formatDate(dateString: string): string {
  const date = parseDateAsLocal(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatTime(dateString: string): string {
  const date = parseDateAsLocal(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Parse a stored event timestamp as "wall clock" local time. The host enters a
 * naive datetime; we display the same Y-M-D H:M to every viewer regardless of
 * their timezone. Components are extracted explicitly (rather than relying on
 * Date string parsing, which varies by engine and is sensitive to ms/offset
 * suffixes) so the displayed time can never drift.
 */
export function parseEventDate(dateString: string): Date {
  const m = dateString.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      s ? Number(s) : 0
    );
  }
  return new Date(dateString);
}

// Backwards-compatible alias used internally.
const parseDateAsLocal = parseEventDate;

export function formatDateTime(dateString: string): string {
  return `${formatDate(dateString)} at ${formatTime(dateString)}`;
}

export function getClaimProgress(
  needs: { quantity: number; claimed_quantity: number }[]
): { claimed: number; total: number; percentage: number } {
  const total = needs.reduce((sum, n) => sum + n.quantity, 0);
  const claimed = needs.reduce((sum, n) => sum + n.claimed_quantity, 0);
  const percentage = total > 0 ? Math.round((claimed / total) * 100) : 0;
  return { claimed, total, percentage };
}
