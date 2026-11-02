import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/api", () => ({
  getOwnerId: vi.fn(),
  isSameOrigin: vi.fn(),
  parseTaskBody: (request: Request) => request.json(),
}));
vi.mock("../lib/rate-limit", () => ({ enforceTaskRateLimit: vi.fn() }));
import { getOwnerId, isSameOrigin } from "../lib/api";
import { enforceTaskRateLimit } from "../lib/rate-limit";
import { POST } from "../app/api/tasks/draft/route";
function request(
  body: unknown = { prompt: "Prepare a demo tomorrow", timezone: "UTC" },
) {
  return new Request("http://localhost:3000/api/tasks/draft", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
describe("AI drafting endpoint", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOwnerId).mockResolvedValue("user-a");
    vi.mocked(isSameOrigin).mockReturnValue(true);
    vi.mocked(enforceTaskRateLimit).mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("rejects anonymous requests before spending AI budget", async () => {
    vi.mocked(getOwnerId).mockResolvedValue(undefined);
    expect((await POST(request())).status).toBe(401);
    expect(enforceTaskRateLimit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    vi.mocked(isSameOrigin).mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("enforces a separate per-user AI budget", async () => {
    vi.mocked(enforceTaskRateLimit).mockResolvedValue(
      Response.json({ error: "Limit exceeded" }, { status: 429 }),
    );
    expect((await POST(request())).status).toBe(429);
    expect(enforceTaskRateLimit).toHaveBeenCalledWith("user-a", "ai");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects invalid input without calling Gemini", async () => {
    expect(
      (await POST(request({ prompt: "hi", timezone: "UTC" }))).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns a private draft without creating a task", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: "Demo",
                    description: "",
                    priority: "medium",
                    dueDate: null,
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      draft: {
        title: "Demo",
        description: "",
        priority: "medium",
        dueDate: null,
        status: "todo",
      },
    });
  });
  it("handles provider failures while keeping manual entry available", async () => {
    fetchMock.mockRejectedValue(new Error("secret provider failure"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret provider failure");
  });
  it("returns a specific timeout response without retrying the provider", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("request expired", "TimeoutError"),
    );
    const response = await POST(request());
    expect(response.status).toBe(504);
    expect((await response.json()).error).toContain("took too long");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
