type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const maximumBuckets = 10_000;
let checksSinceCleanup = 0;

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  while (buckets.size >= maximumBuckets) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  checksSinceCleanup += 1;
  if (checksSinceCleanup >= 128 || buckets.size >= maximumBuckets) {
    pruneBuckets(now);
    checksSinceCleanup = 0;
  }
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true };
}
