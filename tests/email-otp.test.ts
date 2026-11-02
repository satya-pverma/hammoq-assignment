import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  eval: vi.fn(),
  ttl: vi.fn(),
  limit: vi.fn(),
  send: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../lib/brevo", () => ({
  isEmailConfigured: () => true,
  sendOtpEmail: mocks.send,
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    set = mocks.set;
    eval = mocks.eval;
    ttl = mocks.ttl;
  },
}));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn();
    limit = mocks.limit;
  },
}));
describe("email OTP", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    mocks.limit.mockResolvedValue({ success: true });
    mocks.set.mockResolvedValue("OK");
    mocks.send.mockResolvedValue(undefined);
    mocks.eval.mockResolvedValue(1);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("stores only a keyed hash with a 45-second TTL and sends a six-digit code", async () => {
    const { requestEmailOtp } = await import("../lib/email-otp");
    const result = await requestEmailOtp(" Person@Example.com ", "test-ip");
    expect(result.expiresIn).toBe(45);
    const [key, json, options] = mocks.set.mock.calls[0];
    expect(key).not.toContain("person@example.com");
    expect(options).toEqual({ ex: 45, nx: true });
    const record = JSON.parse(json);
    expect(record).toMatchObject({
      challengeId: result.challengeId,
      attempts: 0,
    });
    expect(record.digest).toMatch(/^[a-f0-9]{64}$/);
    const [email, code] = mocks.send.mock.calls[0];
    expect(email).toBe("person@example.com");
    expect(code).toMatch(/^\d{6}$/);
    expect(record).not.toHaveProperty("code");
    expect(record.digest).not.toBe(code);
  });
  it("does not overwrite or resend an unexpired code", async () => {
    mocks.set.mockResolvedValue(null);
    mocks.ttl.mockResolvedValue(22);
    const { requestEmailOtp } = await import("../lib/email-otp");
    await expect(
      requestEmailOtp("person@example.com", "ip"),
    ).rejects.toMatchObject({ status: 429, retryAfter: 22 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("invalidates its own challenge if delivery fails", async () => {
    mocks.send.mockRejectedValue(new Error("provider-private-error"));
    const { requestEmailOtp } = await import("../lib/email-otp");
    await expect(
      requestEmailOtp("person@example.com", "ip"),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.eval).toHaveBeenCalled();
  });
  it("rejects malformed credentials before using Redis", async () => {
    const { verifyEmailOtp } = await import("../lib/email-otp");
    expect(
      await verifyEmailOtp(
        { email: "person@example.com", code: "123", challengeId: "bad" },
        "ip",
      ),
    ).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.eval).not.toHaveBeenCalled();
  });
  it("uses one atomic verification operation and rejects a consumed or expired challenge", async () => {
    const { requestEmailOtp, verifyEmailOtp } =
      await import("../lib/email-otp");
    const challenge = await requestEmailOtp("person@example.com", "ip");
    const code = mocks.send.mock.calls[0][1];
    expect(
      await verifyEmailOtp(
        {
          email: "person@example.com",
          challengeId: challenge.challengeId,
          code,
        },
        "ip",
      ),
    ).toBe("person@example.com");
    expect(mocks.eval).toHaveBeenCalledTimes(1);
    mocks.eval.mockResolvedValue(0);
    expect(
      await verifyEmailOtp(
        {
          email: "person@example.com",
          challengeId: challenge.challengeId,
          code,
        },
        "ip",
      ),
    ).toBeNull();
  });
  it("blocks sending when the rate limiter times out", async () => {
    mocks.limit.mockResolvedValue({ success: true, reason: "timeout" });
    const { requestEmailOtp } = await import("../lib/email-otp");
    await expect(
      requestEmailOtp("person@example.com", "ip"),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks excessive requests before sending email", async () => {
    mocks.limit.mockResolvedValue({
      success: false,
      reset: Date.now() + 60000,
    });
    const { requestEmailOtp } = await import("../lib/email-otp");
    await expect(
      requestEmailOtp("person@example.com", "ip"),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
