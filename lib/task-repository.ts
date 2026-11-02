import "server-only";
import { ObjectId, type Document, type Filter } from "mongodb";
import { getDatabase } from "./mongodb";
import type {
  TaskInput,
  TaskPage,
  TaskQuery,
  TaskSummary,
} from "./task-schema";
export type TaskDocument = TaskInput & {
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};
let indexPromise: Promise<string[]> | undefined;
export async function getTasksCollection() {
  const collection = (await getDatabase()).collection<TaskDocument>("tasks");
  indexPromise ??= collection
    .createIndexes([
      { key: { ownerId: 1, deletedAt: 1, createdAt: -1, _id: -1 } },
      { key: { deletedAt: 1 }, expireAfterSeconds: 30 },
    ])
    .catch((error) => {
      indexPromise = undefined;
      throw error;
    });
  await indexPromise;
  return collection;
}
export function serializeTask(task: TaskDocument & { _id: ObjectId }) {
  return {
    id: task._id.toHexString(),
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function getTaskPage(
  ownerId: string,
  query: TaskQuery,
): Promise<TaskPage> {
  const today = query.today ?? new Date().toISOString().slice(0, 10);
  const activeFilter = { ownerId, deletedAt: null };
  const viewFilter: Filter<TaskDocument> = {};
  if (query.status === "overdue") {
    viewFilter.status = { $ne: "done" };
    viewFilter.dueDate = { $type: "string", $lt: today };
  } else if (query.status !== "all") viewFilter.status = query.status;
  if (query.priority !== "all") viewFilter.priority = query.priority;
  if (query.search) {
    const literal = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    viewFilter.$or = [
      { title: { $regex: literal, $options: "i" } },
      { description: { $regex: literal, $options: "i" } },
    ];
  }
  const sortStages: Document[] =
    query.sort === "priority"
      ? [
          {
            $addFields: {
              sortValue: {
                $indexOfArray: [["high", "medium", "low"], "$priority"],
              },
            },
          },
          { $sort: { sortValue: 1, createdAt: -1, _id: -1 } },
        ]
      : query.sort === "dueDate"
        ? [
            {
              $addFields: {
                sortValue: { $ifNull: ["$dueDate", "9999-12-31"] },
              },
            },
            { $sort: { sortValue: 1, createdAt: -1, _id: -1 } },
          ]
        : [{ $sort: { createdAt: -1, _id: -1 } }];
  const countStatus = (status: string) => ({
    $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] },
  });
  const [result] = await (
    await getTasksCollection()
  )
    .aggregate<{
      tasks: (TaskDocument & { _id: ObjectId })[];
      count: { total: number }[];
      summary: TaskSummary[];
    }>([
      { $match: activeFilter },
      {
        $facet: {
          tasks: [
            { $match: viewFilter },
            ...sortStages,
            { $skip: (query.page - 1) * query.pageSize },
            { $limit: query.pageSize },
          ],
          count: [{ $match: viewFilter }, { $count: "total" }],
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                todo: countStatus("todo"),
                inProgress: countStatus("inProgress"),
                done: countStatus("done"),
                overdue: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$status", "done"] },
                          { $eq: [{ $type: "$dueDate" }, "string"] },
                          { $lt: ["$dueDate", today] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ])
    .toArray();
  const summary = result?.summary[0];
  return {
    tasks: (result?.tasks ?? []).map(serializeTask),
    total: result?.count[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    summary: {
      total: summary?.total ?? 0,
      todo: summary?.todo ?? 0,
      inProgress: summary?.inProgress ?? 0,
      done: summary?.done ?? 0,
      overdue: summary?.overdue ?? 0,
    },
  };
}
export function taskOwnerFilter(ownerId: string, id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  return { _id: new ObjectId(id), ownerId };
}
