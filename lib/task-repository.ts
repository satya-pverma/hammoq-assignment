import "server-only";
import { ObjectId } from "mongodb";
import { getDatabase } from "./mongodb";
import type { TaskInput } from "./task-schema";
type TaskDocument = TaskInput & {
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};
let indexPromise: Promise<string> | undefined;
export async function getTasksCollection() {
  const collection = (await getDatabase()).collection<TaskDocument>("tasks");
  indexPromise ??= collection
    .createIndex({ ownerId: 1, createdAt: -1 })
    .catch((error) => {
      indexPromise = undefined;
      throw error;
    });
  await indexPromise;
  return collection;
}
export function taskOwnerFilter(ownerId: string, id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  return { _id: new ObjectId(id), ownerId };
}
