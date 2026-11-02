import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  slidingWindow: vi.fn(),
  configs: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {}
  },
}));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = mocks.slidingWindow;
    limit = mocks.limit;
    constructor(config: Record<string, unknown>) {
      mocks.configs.push(config);
    }
  },
}));

describe("task rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.configs.length = 0;
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("allows requests and configures independent shared read/write budgets", async () => {
    mocks.limit.mockResolvedValue({ success: true });
    const { enforceTaskRateLimit } = await import("../lib/rate-limit");
    expect(await enforceTaskRateLimit("google-user-id", "read")).toBeNull();
    expect(await enforceTaskRateLimit("google-user-id", "write")).toBeNull();
    expect(mocks.slidingWindow).toHaveBeenCalledWith(120, "1 m");
    expect(mocks.slidingWindow).toHaveBeenCalledWith(30, "1 m");
    expect(mocks.configs).toHaveLength(2);
    expect(mocks.configs[0].prefix).not.toBe(mocks.configs[1].prefix);
    const key = mocks.limit.mock.calls[0][0];
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("google-user-id");
  });
  it("returns 429 and retry guidance when a budget is exhausted", async () => {
    mocks.limit.mockResolvedValue({
      success: false,
      reset: Date.now() + 30000,
      limit: 30,
    });
    const { enforceTaskRateLimit } = await import("../lib/rate-limit");
    const response = await enforceTaskRateLimit("user-a", "write");
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response?.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("fails closed when the SDK would otherwise allow a timeout", async () => {
    mocks.limit.mockResolvedValue({ success: true, reason: "timeout" });
    const { enforceTaskRateLimit } = await import("../lib/rate-limit");
    expect((await enforceTaskRateLimit("user-a", "read"))?.status).toBe(503);
  });
  it("fails closed on Redis errors without exposing credentials", async () => {
    mocks.limit.mockRejectedValue(new Error("private-token"));
    const { enforceTaskRateLimit } = await import("../lib/rate-limit");
    const response = await enforceTaskRateLimit("user-a", "write");
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain("private-token");
    expect(console.error).toHaveBeenCalledWith(
      "Task rate limiter unavailable",
      "Error",
    );
  });
  it("fails closed when configuration is missing", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { enforceTaskRateLimit } = await import("../lib/rate-limit");
    expect((await enforceTaskRateLimit("user-a", "read"))?.status).toBe(503);
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("keeps user budgets separate", async () => {
    mocks.limit.mockResolvedValue({ success: true });
    const { enforceTaskRateLimit } = await import("../lib/rate-limit");
    await enforceTaskRateLimit("user-a", "read");
    await enforceTaskRateLimit("user-b", "read");
    expect(mocks.limit.mock.calls[0][0]).not.toBe(mocks.limit.mock.calls[1][0]);
  });
});
