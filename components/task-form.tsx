"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  statusLabels,
  taskPriorities,
  taskSchema,
  taskStatuses,
  type Task,
  type TaskInput,
} from "@/lib/task-schema";

export function TaskForm({
  task,
  onClose,
  onSave,
}: {
  task: Task | null;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = taskSchema.safeParse({
      title: form.get("title"),
      description: form.get("description"),
      status: form.get("status"),
      priority: form.get("priority"),
      dueDate: form.get("dueDate") || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSave(parsed.data);
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Couldn't save your task.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="task-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      aria-labelledby="task-form-title"
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">MAKE YOUR NEXT MOVE</span>
            <h2 id="task-form-title">{task ? "Edit task" : "Create a task"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close task form"
            disabled={pending}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          Task title
          <input
            name="title"
            required
            autoFocus
            maxLength={120}
            defaultValue={task?.title}
            placeholder="What needs to get done?"
          />
        </label>
        <label>
          Description <span className="optional">optional</span>
          <textarea
            name="description"
            maxLength={2000}
            rows={4}
            defaultValue={task?.description}
            placeholder="Add a little context…"
          />
        </label>
        <div className="form-row">
          <label>
            Status
            <select name="status" defaultValue={task?.status ?? "todo"}>
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={task?.priority ?? "medium"}>
              {taskPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority[0].toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Due date <span className="optional">optional</span>
          <input
            type="date"
            name="dueDate"
            defaultValue={task?.dueDate ?? ""}
          />
        </label>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary-button" disabled={pending}>
            {pending ? "Saving…" : task ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
