import "server-only";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type RequestKind = "read" | "write";
let limiters: Record<RequestKind, Ratelimit> | undefined;

function getLimiters() {
  if (limiters) return limiters;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("RateLimitNotConfigured");
  const redis = new Redis({
    url,
    token,
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(2000),
  });
  const prefix = `tasklane:${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production"}:rate-limit`;
  const createLimiter = (kind: RequestKind, requests: number) =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, "1 m"),
      prefix: `${prefix}:${kind}`,
      timeout: 2000,
      analytics: false,
      ephemeralCache: false,
    });
  limiters = {
    read: createLimiter("read", 120),
    write: createLimiter("write", 30),
  };
  return limiters;
}

function unavailableResponse() {
  return Response.json(
    {
      error:
        "Task service is temporarily unavailable. Please try again shortly.",
    },
    {
      status: 503,
      headers: { "Retry-After": "5", "Cache-Control": "private, no-store" },
    },
  );
}

export async function enforceTaskRateLimit(
  ownerId: string,
  kind: RequestKind,
): Promise<Response | null> {
  try {
    const identifier = createHash("sha256").update(ownerId).digest("hex");
    const result = await getLimiters()[kind].limit(identifier);
    // The SDK normally allows timed-out requests. This app explicitly fails closed.
    if (result.reason === "timeout") {
      console.error("Task rate limiter unavailable", "Timeout");
      return unavailableResponse();
    }
    if (result.success) return null;
    const retryAfter = Math.max(
      1,
      Math.ceil((result.reset - Date.now()) / 1000),
    );
    return Response.json(
      {
        error: `Too many task ${kind === "read" ? "requests" : "changes"}. Try again in ${retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    // Never log Redis URLs, tokens, or raw error messages.
    console.error(
      "Task rate limiter unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return unavailableResponse();
  }
}
