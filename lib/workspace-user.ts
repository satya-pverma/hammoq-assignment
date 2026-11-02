import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./mongodb";

type WorkspaceUser = {
  email: string;
  ownerId: string;
  name: string;
  createdAt: Date;
};

// Call only after Google or an email OTP has verified ownership of the email.
export async function resolveWorkspaceUser(
  email: string,
  name?: string | null,
  legacyOwnerId?: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const db = await getDatabase();
  const users = db.collection<WorkspaceUser>("users");
  await users.createIndex({ email: 1 }, { unique: true });
  let user;
  try {
    user = await users.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $setOnInsert: {
          email: normalizedEmail,
          ownerId: legacyOwnerId ?? randomUUID(),
          name: name || normalizedEmail.split("@")[0],
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== 11000
    )
      throw error;
    user = await users.findOne({ email: normalizedEmail });
  }
  if (!user) throw new Error("WorkspaceUserUnavailable");
  if (legacyOwnerId && legacyOwnerId !== user.ownerId) {
    await db
      .collection("tasks")
      .updateMany(
        { ownerId: legacyOwnerId },
        { $set: { ownerId: user.ownerId } },
      );
  }
  return { id: user.ownerId, email: user.email, name: user.name };
}
