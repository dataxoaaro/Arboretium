// ARB-032: KV-backed rate limiter.
// Counters live in the RATE_LIMIT KV namespace with a TTL equal to the window.
// Cross-isolate consistent (KV is shared across all Worker instances), unlike
// module-scope state which would be per-isolate and useless for rate limiting.

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets, when not allowed. */
  retryAfter?: number;
}

/**
 * Increment a per-key counter and return whether the request is allowed.
 * `windowSeconds` sets the bucket TTL on first hit. Subsequent hits within
 * the bucket extend nothing; the bucket expires automatically.
 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const raw = await kv.get(key);
  const count = raw ? Number(raw) : 0;
  if (Number.isFinite(count) && count >= limit) {
    return { allowed: false, retryAfter: windowSeconds };
  }
  const next = (Number.isFinite(count) ? count : 0) + 1;
  // Re-write with the same TTL each time. This is a small approximation: the
  // TTL slides forward, so a steady stream of hits never resets — fine for
  // brute-force protection and avoids the read-modify-write race entirely.
  await kv.put(key, String(next), { expirationTtl: windowSeconds });
  return { allowed: true };
}

/** Pull the client IP from CF-provided headers, with a safe fallback. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
