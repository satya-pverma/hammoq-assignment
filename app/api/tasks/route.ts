import { getOwnerId, isSameOrigin, parseTaskBody, serviceError } from "@/lib/api";
import { getTasksCollection } from "@/lib/task-repository";
import { taskSchema } from "@/lib/task-schema";
export async function GET() {
  const ownerId = await getOwnerId();
  if (!ownerId) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const tasks = await (await getTasksCollection()).find({ ownerId }).sort({ createdAt: -1 }).toArray();
    return Response.json(tasks.map((task) => ({ id: task._id.toHexString(), title: task.title, description: task.description, status: task.status, priority: task.priority, dueDate: task.dueDate, createdAt: task.createdAt, updatedAt: task.updatedAt })), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return serviceError(error); }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const ownerId = await getOwnerId();
  if (!ownerId) return Response.json({ error: "Please sign in." }, { status: 401 });
  let body: unknown;
  try { body = await parseTaskBody(request); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const now = new Date();
    const task = { ...parsed.data, createdAt: now, updatedAt: now };
    const result = await (await getTasksCollection()).insertOne({ ...task, ownerId });
    return Response.json({ ...task, id: result.insertedId.toHexString() }, { status: 201 });
  } catch (error) { return serviceError(error); }
}
