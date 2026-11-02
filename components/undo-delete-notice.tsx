"use client";
import { useEffect } from "react";

export function UndoDeleteNotice({
  task,
  pending,
  onUndo,
  onExpire,
}: {
  task: { id: string; title: string; undoUntil: string };
  pending: boolean;
  onUndo: (id: string) => Promise<void>;
  onExpire: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => onExpire(task.id),
      Math.max(0, Date.parse(task.undoUntil) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [task.id, task.undoUntil, onExpire]);
  return (
    <div className="undo-notice" role="status">
      <span>
        <strong>{task.title}</strong> deleted. Undo available for 30 seconds.
      </span>
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => onUndo(task.id)}
        aria-label={`Undo deletion of ${task.title}`}
      >
        Undo
      </button>
    </div>
  );
}
