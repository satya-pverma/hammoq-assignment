import "server-only";
import { MongoClient } from "mongodb";
const mongoGlobal = globalThis as typeof globalThis & {
  mongoConnection?: Promise<MongoClient>;
};
export async function getDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MongoDB is not configured.");
  if (!mongoGlobal.mongoConnection) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      waitQueueTimeoutMS: 5000,
    });
    mongoGlobal.mongoConnection = client.connect().catch((error) => {
      mongoGlobal.mongoConnection = undefined;
      throw error;
    });
  }
  return (await mongoGlobal.mongoConnection).db(
    process.env.MONGODB_DB ?? "hammoqTasks",
  );
}
