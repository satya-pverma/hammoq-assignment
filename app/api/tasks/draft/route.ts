import { getOwnerId, isSameOrigin, parseTaskBody } from "@/lib/api";
import {
  AiTaskError,
  aiTaskRequestSchema,
  generateTaskDraft,
} from "@/lib/ai-task";
import { enforceTaskRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const ownerId = await getOwnerId();
  if (!ownerId)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  const limited = await enforceTaskRateLimit(ownerId, "ai");
  if (limited) return limited;
  let body;
  try {
    body = await parseTaskBody(request);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = aiTaskRequestSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  try {
    return Response.json(
      { draft: await generateTaskDraft(parsed.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    // Provider responses and prompts may contain private content; never log them.
    console.error(
      "AI task drafting failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      {
        error:
          error instanceof AiTaskError
            ? error.message
            : timedOut
              ? "Gemini took too long to respond. Please try again or enter the task manually."
              : "AI drafting failed. You can still enter the task manually.",
      },
      {
        status:
          error instanceof AiTaskError ? error.status : timedOut ? 504 : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
