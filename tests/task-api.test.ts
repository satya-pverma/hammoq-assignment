import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("../lib/auth", () => ({ authOptions: {}, isAuthConfigured: () => true }));
vi.mock("../lib/mongodb", () => ({ getDatabase: vi.fn() }));
import { getServerSession } from "next-auth";
import { getDatabase } from "../lib/mongodb";
import { GET, POST } from "../app/api/tasks/route";
import { PUT, DELETE } from "../app/api/tasks/[id]/route";
const id = "507f1f77bcf86cd799439011";
const input = {
  title: "Private task",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: null,
};
const collection = {
  createIndex: vi.fn().mockResolvedValue("index"),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
  find: vi.fn(),
  insertOne: vi.fn(),
};
function request(
  method: string,
  body: unknown = input,
  origin = "http://localhost:3000",
) {
  return new Request(`http://localhost:3000/api/tasks/${id}`, {
    method,
    headers: { origin },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
}
describe("task authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-a" },
      expires: "2099-01-01",
    });
    vi.mocked(getDatabase).mockResolvedValue({
      collection: () => collection,
    } as never);
  });
  it("rejects anonymous reads and writes before database access", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request("POST"))).status).toBe(401);
    expect(
      (await DELETE(request("DELETE"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes", async () => {
    expect(
      (await POST(request("POST", input, "https://attacker.example"))).status,
    ).toBe(403);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("rejects forged ownership", async () => {
    expect(
      (await POST(request("POST", { ...input, ownerId: "user-b" }))).status,
    ).toBe(400);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("scopes updates to the authenticated owner and hides foreign tasks", async () => {
    collection.findOneAndUpdate.mockResolvedValue(null);
    expect(
      (await PUT(request("PUT"), { params: Promise.resolve({ id }) })).status,
    ).toBe(404);
    expect(collection.findOneAndUpdate.mock.calls[0][0].ownerId).toBe("user-a");
    expect(collection.findOneAndUpdate.mock.calls[0][0]._id.toHexString()).toBe(
      id,
    );
  });
  it("scopes deletes to the authenticated owner", async () => {
    collection.deleteOne.mockResolvedValue({ deletedCount: 0 });
    expect(
      (await DELETE(request("DELETE"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(404);
    expect(collection.deleteOne.mock.calls[0][0].ownerId).toBe("user-a");
  });
  it("rejects malformed task ids", async () => {
    expect(
      (
        await DELETE(request("DELETE"), {
          params: Promise.resolve({ id: "invalid" }),
        })
      ).status,
    ).toBe(404);
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
