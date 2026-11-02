import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { aiTaskRequestSchema, generateTaskDraft } from "../lib/ai-task";
const draft = {
  title: "Prepare demo",
  description: "Include login and deployment.",
  priority: "high",
  dueDate: "2026-11-04",
};
const fetchMock = vi.fn();
function modelResponse(value: unknown, finishReason = "STOP") {
  return Response.json({
    candidates: [
      { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
    ],
  });
}
describe("Gemini task drafting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.1-flash-lite");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("validates input length, timezone, and unexpected fields", () => {
    expect(
      aiTaskRequestSchema.safeParse({ prompt: "short", timezone: "UTC" })
        .success,
    ).toBe(false);
    expect(
      aiTaskRequestSchema.safeParse({
        prompt: "Prepare the demo",
        timezone: "unknown",
      }).success,
    ).toBe(false);
    expect(
      aiTaskRequestSchema.safeParse({
        prompt: "x".repeat(2001),
        timezone: "UTC",
      }).success,
    ).toBe(false);
    expect(
      aiTaskRequestSchema.safeParse({
        prompt: "Prepare the demo",
        timezone: "UTC",
        ownerId: "someone",
      }).success,
    ).toBe(false);
  });
  it("returns a validated draft with to-do status and sends only submitted text", async () => {
    fetchMock.mockResolvedValue(modelResponse(draft));
    expect(
      await generateTaskDraft({
        prompt: "Prepare demo tomorrow, high priority",
        timezone: "Asia/Calcutta",
      }),
    ).toEqual({ ...draft, status: "todo" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).not.toContain("test-key");
    expect(options.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(options.body);
    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [{ text: "Prepare demo tomorrow, high priority" }],
      },
    ]);
    expect(body.systemInstruction.parts[0].text).toContain(
      "timezone=Asia/Calcutta",
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });
  it.each([
    { ...draft, dueDate: "2026-02-30" },
    { ...draft, priority: "urgent" },
    { ...draft, ownerId: "other" },
    { ...draft, status: "done" },
  ])("rejects invalid model fields", async (value) => {
    fetchMock.mockResolvedValue(modelResponse(value));
    await expect(
      generateTaskDraft({ prompt: "Prepare the assessment", timezone: "UTC" }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("rejects truncated or blocked model output", async () => {
    fetchMock.mockResolvedValue(modelResponse(draft, "MAX_TOKENS"));
    await expect(
      generateTaskDraft({ prompt: "Prepare the assessment", timezone: "UTC" }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("does not expose raw provider errors", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { message: "private provider details" } },
        { status: 429 },
      ),
    );
    await expect(
      generateTaskDraft({ prompt: "Prepare the assessment", timezone: "UTC" }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("requires a server API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(
      generateTaskDraft({ prompt: "Prepare the assessment", timezone: "UTC" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
