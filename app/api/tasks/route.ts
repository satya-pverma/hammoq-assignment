import {
  getOwnerId,
  isSameOrigin,
  parseTaskBody,
  serviceError,
} from "@/lib/api";
import { getTaskPage, getTasksCollection } from "@/lib/task-repository";
import { taskSchema, taskQuerySchema } from "@/lib/task-schema";
export async function GET(request: Request) {
  const ownerId = await getOwnerId();
  if (!ownerId)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  const query = taskQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return Response.json(
      { error: "Invalid task filters or page." },
      { status: 400 },
    );
  try {
    return Response.json(await getTaskPage(ownerId, query.data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return serviceError(error);
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const ownerId = await getOwnerId();
  if (!ownerId)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  let body: unknown;
  try {
    body = await parseTaskBody(request);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  try {
    const now = new Date();
    const task = { ...parsed.data, createdAt: now, updatedAt: now };
    const result = await (
      await getTasksCollection()
    ).insertOne({ ...task, ownerId });
    return Response.json(
      { ...task, id: result.insertedId.toHexString() },
      { status: 201 },
    );
  } catch (error) {
    return serviceError(error);
  }
}
