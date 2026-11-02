import "server-only";
import { createHash, createHmac, randomInt, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { z } from "zod";
import { isEmailConfigured, sendOtpEmail } from "./brevo";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const otpCredentialsSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  challengeId: z.string().uuid(),
});
export const otpTtlSeconds = 45;
export class OtpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "OtpError";
  }
}
export function isOtpConfigured() {
  return Boolean(
    isEmailConfigured() &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN &&
    process.env.NEXTAUTH_SECRET,
  );
}
const namespace = `tasklane:${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production"}:otp`;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const otpKey = (email: string) => `${namespace}:code:${hash(email)}`;
function digest(email: string, challengeId: string, code: string) {
  if (!process.env.NEXTAUTH_SECRET) throw new Error("MissingOtpSecret");
  return createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(`${email}:${challengeId}:${code}`)
    .digest("hex");
}
let services:
  | {
      redis: Redis;
      sendEmail: Ratelimit;
      sendIp: Ratelimit;
      verifyEmail: Ratelimit;
      verifyIp: Ratelimit;
    }
  | undefined;
function getServices() {
  if (services) return services;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("OtpRedisNotConfigured");
  const redis = new Redis({
    url,
    token,
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(2000),
  });
  const limiter = (suffix: string, count: number, window: "15 m" | "5 m") =>
    new Ratelimit({
      redis,
      prefix: `${namespace}:${suffix}`,
      limiter: Ratelimit.slidingWindow(count, window),
      timeout: 2000,
      analytics: false,
      ephemeralCache: false,
    });
  services = {
    redis,
    sendEmail: limiter("send-email", 3, "15 m"),
    sendIp: limiter("send-ip", 20, "15 m"),
    verifyEmail: limiter("verify-email", 10, "5 m"),
    verifyIp: limiter("verify-ip", 30, "5 m"),
  };
  return services;
}
async function checkLimit(limiter: Ratelimit, identifier: string) {
  const result = await limiter.limit(hash(identifier));
  if (result.reason === "timeout")
    throw new OtpError(
      503,
      "Sign-in is temporarily unavailable. Please try again.",
    );
  if (!result.success)
    throw new OtpError(
      429,
      "Too many sign-in attempts. Please try again later.",
      Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    );
}
export function clientIp(
  headers: Headers | Record<string, string | string[] | undefined>,
) {
  // Only trust the platform-provided forwarding header on Vercel.
  if (!process.env.VERCEL) return "local-development";
  const value =
    headers instanceof Headers
      ? headers.get("x-forwarded-for")
      : headers["x-forwarded-for"];
  return (
    (Array.isArray(value) ? value[0] : value)?.split(",")[0].trim() || "unknown"
  );
}
const cleanupScript = `local value = redis.call('GET', KEYS[1]); if not value then return 0 end; local record = cjson.decode(value); if record.challengeId ~= ARGV[1] then return 0 end; return redis.call('DEL', KEYS[1])`;
export async function requestEmailOtp(email: string, ip: string) {
  if (!isOtpConfigured())
    throw new OtpError(503, "Email sign-in is not configured yet.");
  const normalizedEmail = emailSchema.parse(email);
  const { redis, sendEmail, sendIp } = getServices();
  await checkLimit(sendIp, ip);
  await checkLimit(sendEmail, normalizedEmail);
  const challengeId = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = Date.now() + otpTtlSeconds * 1000;
  const key = otpKey(normalizedEmail);
  const stored = await redis.set(
    key,
    JSON.stringify({
      challengeId,
      digest: digest(normalizedEmail, challengeId, code),
      attempts: 0,
    }),
    { ex: otpTtlSeconds, nx: true },
  );
  if (!stored)
    throw new OtpError(
      429,
      "A code was already requested. Wait until it expires before requesting another.",
      Math.max(1, await redis.ttl(key)),
    );
  try {
    await sendOtpEmail(normalizedEmail, code);
  } catch {
    await redis.eval(cleanupScript, [key], [challengeId]);
    throw new OtpError(
      503,
      "We couldn't send the email. Please try again shortly.",
    );
  }
  return { challengeId, expiresAt, expiresIn: otpTtlSeconds };
}
// Checking attempts and consuming a successful code happen in one Redis operation.
export const verifyOtpScript = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local record = cjson.decode(value)
if record.challengeId ~= ARGV[1] then return 0 end
if record.digest == ARGV[2] then redis.call('DEL', KEYS[1]); return 1 end
record.attempts = record.attempts + 1
if record.attempts >= 5 then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], cjson.encode(record), 'KEEPTTL') end
return 0`;
export async function verifyEmailOtp(input: unknown, ip: string) {
  const parsed = otpCredentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  if (!isOtpConfigured())
    throw new OtpError(503, "Email sign-in is unavailable.");
  const { email, code, challengeId } = parsed.data;
  const { redis, verifyEmail, verifyIp } = getServices();
  await checkLimit(verifyIp, ip);
  await checkLimit(verifyEmail, email);
  const valid = await redis.eval(
    verifyOtpScript,
    [otpKey(email)],
    [challengeId, digest(email, challengeId, code)],
  );
  return valid === 1 ? email : null;
}
