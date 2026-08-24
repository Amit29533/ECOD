/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Best-effort protection for a single instance (pilot tier). For multi-instance
 * deployments swap for a shared store - see docs/PRODUCTION-READINESS.md.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export function rateLimit(key: string, max: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  // occasional sweep so the map doesn't grow unbounded
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
    lastSweep = now;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}
