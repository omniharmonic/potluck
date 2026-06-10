// Lightweight in-memory sliding-window rate limiter.
//
// NOTE: this is per-process. On Vercel's serverless/edge runtime each instance
// has its own map, so this is best-effort abuse mitigation, not a hard global
// limit. For production-grade limiting back it with Upstash/Vercel KV and the
// same interface. It still meaningfully blunts single-source spam.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterSec: 0 };
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// Opportunistic cleanup so the map can't grow unbounded on a long-lived instance.
export function sweepRateLimiter() {
  const now = Date.now();
  Array.from(buckets.entries()).forEach(([key, b]) => {
    if (b.resetAt <= now) buckets.delete(key);
  });
}
