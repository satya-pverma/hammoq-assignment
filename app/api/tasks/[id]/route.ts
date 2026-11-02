import { getOwnerId, isSameOrigin, parseTaskBody, serviceError } from "@/lib/api";
import { getTasksCollection, taskOwnerFilter } from "@/lib/task-repository";
import { taskSchema } from "@/lib/task-schema";
async function mutateTask(request: Request, context: { params: Promise<{ id: string }> }, remove: boolean) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const ownerId = await getOwnerId();
  if (!ownerId) return Response.json({ error: "Please sign in." }, { status: 401 });
  const filter = taskOwnerFilter(ownerId, (await context.params).id);
  if (!filter) return Response.json({ error: "Task not found." }, { status: 404 });
  let input;
  if (!remove) {
    let body: unknown;
    try { body = await parseTaskBody(request); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const parsed = taskSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    input = parsed.data;
  }
  try {
    const collection = await getTasksCollection();
    if (remove) {
      const result = await collection.deleteOne(filter);
      return result.deletedCount ? new Response(null, { status: 204 }) : Response.json({ error: "Task not found." }, { status: 404 });
    }
    const task = await collection.findOneAndUpdate(filter, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json({ id: task._id.toHexString(), title: task.title, description: task.description, status: task.status, priority: task.priority, dueDate: task.dueDate, createdAt: task.createdAt, updatedAt: task.updatedAt });
  } catch (error) { return serviceError(error); }
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return mutateTask(request, context, false); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return mutateTask(request, context, true); }
