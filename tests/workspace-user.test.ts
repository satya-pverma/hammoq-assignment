import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/mongodb", () => ({ getDatabase: vi.fn() }));
import { getDatabase } from "../lib/mongodb";
import { resolveWorkspaceUser } from "../lib/workspace-user";
const users = {
  createIndex: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOne: vi.fn(),
};
const tasks = { updateMany: vi.fn() };
describe("shared verified-email workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDatabase).mockResolvedValue({
      collection: (name: string) => (name === "users" ? users : tasks),
    } as never);
  });
  it("normalizes email and preserves an existing Google owner", async () => {
    users.findOneAndUpdate.mockResolvedValue({
      email: "person@example.com",
      ownerId: "google-id",
      name: "Person",
    });
    expect((await resolveWorkspaceUser(" Person@Example.com ")).id).toBe(
      "google-id",
    );
    expect(users.findOneAndUpdate.mock.calls[0][0]).toEqual({
      email: "person@example.com",
    });
    expect(users.createIndex).toHaveBeenCalledWith(
      { email: 1 },
      { unique: true },
    );
    expect(tasks.updateMany).not.toHaveBeenCalled();
  });
  it("moves only the verified Google account's old tasks to its existing email workspace", async () => {
    users.findOneAndUpdate.mockResolvedValue({
      email: "person@example.com",
      ownerId: "otp-workspace",
      name: "Person",
    });
    expect(
      (await resolveWorkspaceUser("person@example.com", "Person", "google-id"))
        .id,
    ).toBe("otp-workspace");
    expect(tasks.updateMany).toHaveBeenCalledWith(
      { ownerId: "google-id" },
      { $set: { ownerId: "otp-workspace" } },
    );
  });
  it("uses the original Google owner when creating the shared user record", async () => {
    users.findOneAndUpdate.mockResolvedValue({
      email: "person@example.com",
      ownerId: "google-id",
      name: "Person",
    });
    await resolveWorkspaceUser("person@example.com", "Person", "google-id");
    expect(users.findOneAndUpdate.mock.calls[0][1].$setOnInsert.ownerId).toBe(
      "google-id",
    );
    expect(tasks.updateMany).not.toHaveBeenCalled();
  });
  it("resolves concurrent first sign-ins through the unique email record", async () => {
    users.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 });
    users.findOne.mockResolvedValue({
      email: "person@example.com",
      ownerId: "existing",
      name: "Person",
    });
    expect((await resolveWorkspaceUser("person@example.com")).id).toBe(
      "existing",
    );
  });
});
