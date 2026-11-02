import { describe, expect, it } from "vitest";
import { taskSchema } from "../lib/task-schema";
const input = {
  title: "Ship assessment",
  description: "",
  status: "todo",
  priority: "high",
  dueDate: null,
};
describe("task validation", () => {
  it("normalizes whitespace", () => {
    expect(
      taskSchema.parse({ ...input, title: "  Ship assessment  " }).title,
    ).toBe("Ship assessment");
  });
  it.each(["", " ", "x".repeat(121)])("rejects an invalid title", (title) => {
    expect(taskSchema.safeParse({ ...input, title }).success).toBe(false);
  });
  it("rejects forged ownership and unexpected fields", () => {
    expect(
      taskSchema.safeParse({ ...input, ownerId: "another-user" }).success,
    ).toBe(false);
  });
  it.each(["2026-02-30", "2026-13-01", "not-a-date"])(
    "rejects impossible dates",
    (dueDate) => {
      expect(taskSchema.safeParse({ ...input, dueDate }).success).toBe(false);
    },
  );
  it("accepts leap days", () => {
    expect(
      taskSchema.safeParse({ ...input, dueDate: "2028-02-29" }).success,
    ).toBe(true);
  });
  it("rejects unknown statuses", () => {
    expect(taskSchema.safeParse({ ...input, status: "archived" }).success).toBe(
      false,
    );
  });
});
