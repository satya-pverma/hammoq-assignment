import { z } from "zod";
export const taskStatuses = ["todo", "inProgress", "done"] as const;
export const taskPriorities = ["low", "medium", "high"] as const;
export const taskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "A title is required.")
      .max(120, "Keep the title under 120 characters."),
    description: z.string().trim().max(2000).default(""),
    status: z.enum(taskStatuses),
    priority: z.enum(taskPriorities),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }, "Enter a valid date.")
      .nullable(),
  })
  .strict();
export type TaskInput = z.infer<typeof taskSchema>;
export type Task = TaskInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export const statusLabels = {
  todo: "To do",
  inProgress: "In progress",
  done: "Completed",
};
