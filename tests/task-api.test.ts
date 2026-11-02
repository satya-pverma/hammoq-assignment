import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("../lib/auth", () => ({
  authOptions: {},
  isAuthConfigured: () => true,
}));
vi.mock("../lib/mongodb", () => ({ getDatabase: vi.fn() }));
vi.mock("../lib/rate-limit", () => ({
  enforceTaskRateLimit: vi.fn().mockResolvedValue(null),
}));
import { enforceTaskRateLimit } from "../lib/rate-limit";
import { getServerSession } from "next-auth";
import { getDatabase } from "../lib/mongodb";
import { GET, POST } from "../app/api/tasks/route";
import { PUT, DELETE, PATCH } from "../app/api/tasks/[id]/route";
import { ObjectId } from "mongodb";
import { undoWindowMs } from "../lib/task-schema";
const id = "507f1f77bcf86cd799439011";
const input = {
  title: "Private task",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: null,
};
const collection = {
  createIndexes: vi.fn().mockResolvedValue(["index", "ttl"]),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
  find: vi.fn(),
  insertOne: vi.fn(),
  aggregate: vi.fn(),
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
    vi.mocked(enforceTaskRateLimit).mockResolvedValue(null);
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
    expect(
      (await GET(new Request("http://localhost:3000/api/tasks"))).status,
    ).toBe(401);
    expect((await POST(request("POST"))).status).toBe(401);
    expect(
      (await DELETE(request("DELETE"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
    expect(enforceTaskRateLimit).not.toHaveBeenCalled();
  });
  it("returns the limiter response before accessing MongoDB on every task route", async () => {
    vi.mocked(enforceTaskRateLimit).mockImplementation(async () =>
      Response.json({ error: "Too many requests" }, { status: 429 }),
    );
    const context = { params: Promise.resolve({ id }) };
    expect(
      (await GET(new Request("http://localhost:3000/api/tasks"))).status,
    ).toBe(429);
    expect((await POST(request("POST"))).status).toBe(429);
    expect((await PUT(request("PUT"), context)).status).toBe(429);
    expect((await DELETE(request("DELETE"), context)).status).toBe(429);
    expect((await PATCH(request("PATCH"), context)).status).toBe(429);
    expect(enforceTaskRateLimit).toHaveBeenCalledWith("user-a", "read");
    expect(enforceTaskRateLimit).toHaveBeenCalledWith("user-a", "write");
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
    collection.findOneAndUpdate.mockResolvedValue(null);
    expect(
      (await DELETE(request("DELETE"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(404);
    expect(collection.findOneAndUpdate.mock.calls[0][0].ownerId).toBe("user-a");
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
  it("rejects anonymous restores", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect(
      (await PATCH(request("PATCH"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("rejects cross-origin restores", async () => {
    expect(
      (
        await PATCH(request("PATCH", input, "https://attacker.example"), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(403);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("soft deletes an active task and returns a server-generated undo deadline", async () => {
    collection.findOneAndUpdate.mockResolvedValue({ _id: new ObjectId(id) });
    const before = Date.now();
    const response = await DELETE(request("DELETE"), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(200);
    const { undoUntil } = await response.json();
    expect(Date.parse(undoUntil)).toBeGreaterThanOrEqual(before + undoWindowMs);
    const [filter, update] = collection.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ ownerId: "user-a", deletedAt: null });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(collection.deleteOne).not.toHaveBeenCalled();
  });
  it("restores only the owner's recently deleted task with the same identity", async () => {
    const now = new Date();
    collection.findOneAndUpdate.mockResolvedValue({
      ...input,
      _id: new ObjectId(id),
      ownerId: "user-a",
      createdAt: now,
      updatedAt: now,
    });
    const before = Date.now();
    const response = await PATCH(request("PATCH"), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(id);
    const [filter, update] = collection.findOneAndUpdate.mock.calls[0];
    expect(filter.ownerId).toBe("user-a");
    expect(filter.deletedAt.$gt.getTime()).toBeGreaterThanOrEqual(
      before - undoWindowMs,
    );
    expect(update.$unset).toEqual({ deletedAt: "" });
  });
  it("returns 404 when restoration has expired or the task belongs to another user", async () => {
    collection.findOneAndUpdate.mockResolvedValue(null);
    expect(
      (await PATCH(request("PATCH"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(404);
  });
});

describe("paginated task reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-a" },
      expires: "2099-01-01",
    });
    vi.mocked(getDatabase).mockResolvedValue({
      collection: () => collection,
    } as never);
    collection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          tasks: [],
          count: [{ total: 21 }],
          summary: [
            { total: 30, todo: 15, inProgress: 10, done: 5, overdue: 2 },
          ],
        },
      ]),
    });
  });
  it.each([
    "page=0",
    "page=-1",
    "page=1.5",
    "pageSize=999",
    "sort=unknown",
    "status=unknown",
    "ownerId=user-b",
    "today=2026-02-30",
  ])("rejects invalid pagination or filters: %s", async (query) => {
    expect(
      (await GET(new Request(`http://localhost:3000/api/tasks?${query}`)))
        .status,
    ).toBe(400);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("bounds the page, excludes deleted tasks, and returns unfiltered account totals", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/tasks?page=2&pageSize=10&status=todo&priority=high&today=2026-11-02",
      ),
    );
    const body = await response.json();
    expect(body).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 21,
      summary: { total: 30, done: 5 },
    });
    const pipeline = collection.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({
      $match: { ownerId: "user-a", deletedAt: null },
    });
    expect(pipeline[1].$facet.tasks).toContainEqual({
      $match: { status: "todo", priority: "high" },
    });
    expect(pipeline[1].$facet.tasks).toContainEqual({ $skip: 10 });
    expect(pipeline[1].$facet.tasks).toContainEqual({ $limit: 10 });
    expect(pipeline[1].$facet.tasks).toContainEqual({
      $sort: { createdAt: -1, _id: -1 },
    });
  });
  it("treats search as literal text rather than a regular expression", async () => {
    await GET(
      new Request(
        "http://localhost:3000/api/tasks?search=" +
          encodeURIComponent("a.*[b]"),
      ),
    );
    const viewFilter =
      collection.aggregate.mock.calls[0][0][1].$facet.tasks[0].$match;
    expect(viewFilter.$or[0].title.$regex).toBe("a\\.\\*\\[b\\]");
  });
});
