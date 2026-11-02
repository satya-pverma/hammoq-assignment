import {
  getOwnerId,
  isSameOrigin,
  parseTaskBody,
  serviceError,
} from "@/lib/api";
import {
  getTasksCollection,
  serializeTask,
  taskOwnerFilter,
} from "@/lib/task-repository";
import { taskSchema, undoWindowMs } from "@/lib/task-schema";
import { enforceTaskRateLimit } from "@/lib/rate-limit";
async function mutateTask(
  request: Request,
  context: { params: Promise<{ id: string }> },
  remove: boolean,
) {
  if (!isSameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const ownerId = await getOwnerId();
  if (!ownerId)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  const limited = await enforceTaskRateLimit(ownerId, "write");
  if (limited) return limited;
  const filter = taskOwnerFilter(ownerId, (await context.params).id);
  if (!filter)
    return Response.json({ error: "Task not found." }, { status: 404 });
  let input;
  if (!remove) {
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
    input = parsed.data;
  }
  try {
    const collection = await getTasksCollection();
    if (remove) {
      const now = new Date();
      const task = await collection.findOneAndUpdate(
        { ...filter, deletedAt: null },
        { $set: { deletedAt: now, updatedAt: now } },
        { returnDocument: "after" },
      );
      return task
        ? Response.json({
            undoUntil: new Date(now.getTime() + undoWindowMs).toISOString(),
          })
        : Response.json({ error: "Task not found." }, { status: 404 });
    }
    const task = await collection.findOneAndUpdate(
      { ...filter, deletedAt: null },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!task)
      return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json(serializeTask(task));
  } catch (error) {
    return serviceError(error);
  }
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return mutateTask(request, context, false);
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return mutateTask(request, context, true);
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const ownerId = await getOwnerId();
  if (!ownerId)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  const limited = await enforceTaskRateLimit(ownerId, "write");
  if (limited) return limited;
  const filter = taskOwnerFilter(ownerId, (await context.params).id);
  if (!filter)
    return Response.json({ error: "Task not found." }, { status: 404 });
  try {
    const now = new Date();
    const task = await (
      await getTasksCollection()
    ).findOneAndUpdate(
      { ...filter, deletedAt: { $gt: new Date(now.getTime() - undoWindowMs) } },
      { $unset: { deletedAt: "" }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    return task
      ? Response.json(serializeTask(task))
      : Response.json(
          {
            error:
              "This task cannot be restored. The undo window may have expired.",
          },
          { status: 404 },
        );
  } catch (error) {
    return serviceError(error);
  }
}
