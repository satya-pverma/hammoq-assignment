"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
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
  const [values, setValues] = useState<TaskInput>(
    task ?? {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
    },
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiNotice, setAiNotice] = useState("");
  const aiController = useRef<AbortController | null>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
    return () => aiController.current?.abort();
  }, []);
  async function draftWithAi() {
    setAiPending(true);
    setAiError("");
    setAiNotice("");
    const controller = new AbortController();
    aiController.current = controller;
    try {
      const response = await fetch("/api/tasks/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Couldn't draft your task.");
      const draft = taskSchema.safeParse(body.draft);
      if (!draft.success)
        throw new Error(
          "The draft was invalid. Please enter your task manually.",
        );
      if (controller.signal.aborted) return;
      setValues(draft.data);
      setAiNotice(
        "Draft ready. Review and edit the fields below before creating your task.",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setAiError(
          error instanceof Error
            ? error.message
            : "Couldn't draft your task. Manual entry is still available.",
        );
    } finally {
      if (!controller.signal.aborted) setAiPending(false);
    }
  }
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
        {!task && (
          <section className="ai-draft-panel" aria-label="AI task drafting">
            <label htmlFor="ai-task-prompt">
              <Sparkles size={15} />
              Draft with AI <span className="optional">optional</span>
            </label>
            <textarea
              id="ai-task-prompt"
              rows={3}
              maxLength={2000}
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              disabled={pending || aiPending}
              placeholder="Prepare the assessment demo by Friday, high priority. Include login and deployment."
            />
            <p>
              Only this description is sent to Google Gemini. Review its
              suggestions before saving.
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={pending || aiPending || aiPrompt.trim().length < 10}
              onClick={draftWithAi}
            >
              <Sparkles size={15} />
              {aiPending ? "Drafting…" : "Fill task fields with AI"}
            </button>
            {aiError && (
              <p role="alert" className="error-message">
                {aiError}
              </p>
            )}
            <p role="status" className="ai-draft-notice">
              {aiNotice}
            </p>
          </section>
        )}
        <fieldset className="task-fields" disabled={pending || aiPending}>
          <label>
            Task title
            <input
              name="title"
              required
              autoFocus
              maxLength={120}
              value={values.title}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="What needs to get done?"
            />
          </label>
          <label>
            Description <span className="optional">optional</span>
            <textarea
              name="description"
              maxLength={2000}
              rows={4}
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Add a little context…"
            />
          </label>
          <div className="form-row">
            <label>
              Status
              <select
                name="status"
                value={values.status}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as TaskInput["status"],
                  }))
                }
              >
                {taskStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                name="priority"
                value={values.priority}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    priority: event.target.value as TaskInput["priority"],
                  }))
                }
              >
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
              value={values.dueDate ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  dueDate: event.target.value || null,
                }))
              }
            />
          </label>
        </fieldset>
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
          <button className="primary-button" disabled={pending || aiPending}>
            {pending ? "Saving…" : task ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
