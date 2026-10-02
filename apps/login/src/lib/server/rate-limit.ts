import "server-only";

/**
 * HolyCode: a small in-memory limiter for the registration actions (one login
 * container; Daenerys keeps its own limits for the mailbox API). Fixed window per key.
 */
const buckets = new Map<string, { start: number; count: number }>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 10_000) {
    buckets.forEach((b, k) => {
      if (now - b.start > windowMs) buckets.delete(k);
    });
  }
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function resetRateLimits() {
  buckets.clear();
}
