"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  Clock3,
  Layers3,
  LayoutList,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  statusLabels,
  type Task,
  type TaskInput,
  type TaskPage,
  type TaskSummary,
} from "@/lib/task-schema";
import { TaskForm } from "./task-form";
import { UndoDeleteNotice } from "./undo-delete-notice";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Something went wrong. Please try again.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function TaskWorkspace({ name }: { name: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [priority, setPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState("newest");
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<TaskSummary>({
    total: 0,
    todo: 0,
    inProgress: 0,
    done: 0,
    overdue: 0,
  });
  const [deletedTasks, setDeletedTasks] = useState<
    { id: string; title: string; undoUntil: string }[]
  >([]);
  const requestId = useRef(0);
  const invalidateRequests = useCallback(() => {
    ++requestId.current;
  }, []);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: filter,
        priority,
        search,
        sort,
        today: today || localDate(),
      });
      const result = await request<TaskPage>("/api/tasks?" + params);
      if (currentRequest !== requestId.current) return;
      setSummary(result.summary);
      setTotal(result.total);
      setTasks(result.tasks);
      const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
      if (page > lastPage) setPage(lastPage);
    } catch (error) {
      if (currentRequest === requestId.current)
        setError((error as Error).message);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [page, filter, priority, search, sort, today]);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);
  useEffect(() => {
    if (searchInput !== search) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      invalidateRequests();
    };
  }, [load, invalidateRequests, searchInput, search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setToday(localDate()), 0);
    const dateTimer = window.setInterval(() => setToday(localDate()), 60000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(dateTimer);
    };
  }, []);
  const completed = summary.done;
  const overdue = summary.overdue;
  const visible = tasks;
  const dismissUndo = useCallback(
    (id: string) =>
      setDeletedTasks((current) => current.filter((task) => task.id !== id)),
    [],
  );
  function changeFilter(value: string) {
    if (value === filter && page === 1) return;
    setLoading(true);
    setPage(1);
    setFilter(value);
  }
  async function save(input: TaskInput) {
    await request<Task>(
      editor?.task ? `/api/tasks/${editor.task.id}` : "/api/tasks",
      { method: editor?.task ? "PUT" : "POST", body: JSON.stringify(input) },
    );
    await load();
    setNotice(editor?.task ? "Task updated." : "Task created.");
  }
  async function toggle(task: Task) {
    setBusyId(task.id);
    setError("");
    const { title, description, priority, dueDate } = task;
    try {
      const updated = await request<Task>(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          description,
          priority,
          dueDate,
          status: task.status === "done" ? "todo" : "done",
        }),
      });
      await load();
      setNotice(
        updated.status === "done"
          ? "Task completed. Nice work!"
          : "Task reopened.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function remove(task: Task) {
    setBusyId(task.id);
    setError("");
    try {
      const result = await request<{ undoUntil: string }>(
        "/api/tasks/" + task.id,
        { method: "DELETE" },
      );
      setDeletedTasks((current) => [
        ...current,
        { id: task.id, title: task.title, undoUntil: result.undoUntil },
      ]);
      setNotice("Task deleted. Undo is available for 30 seconds.");
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function restore(id: string) {
    setBusyId(id);
    setError("");
    try {
      await request<Task>("/api/tasks/" + id, { method: "PATCH" });
      dismissUndo(id);
      setNotice("Task restored.");
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Layers3 size={22} />
          </span>
          tasklane<span className="brand-dot">.</span>
        </Link>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Task views">
          {[
            {
              id: "all",
              label: "All tasks",
              icon: LayoutList,
              count: summary.total,
            },
            {
              id: "todo",
              label: "To do",
              icon: Circle,
              count: summary.todo,
            },
            {
              id: "inProgress",
              label: "In progress",
              icon: Clock3,
              count: summary.inProgress,
            },
            {
              id: "done",
              label: "Completed",
              icon: CheckCheck,
              count: completed,
            },
          ].map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              className={`nav-item ${filter === id ? "active" : ""}`}
              disabled={busyId !== null}
              onClick={() => changeFilter(id)}
            >
              <Icon size={18} />
              {label}
              <span>{count}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span>One thing at a time.</span>
          <p>
            Small steps today.
            <br />
            Meaningful progress tomorrow.
          </p>
          <div className="tip-art">✳</div>
        </div>
        <div className="user-profile">
          <span className="avatar">{name[0]?.toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>Personal workspace</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />
            <strong>My tasks</strong>
          </span>
          <div className="header-account">
            <span className="private-label">● Private workspace</span>
            <button
              className="icon-button"
              aria-label="Sign out of workspace"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="workspace-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">A LITTLE FOCUS GOES A LONG WAY</span>
              <h1>
                Let’s make things happen<span>.</span>
              </h1>
              <p>Welcome, {name.split(" ")[0]}. Here’s what’s on your plate.</p>
            </div>
            <button
              className="primary-button"
              disabled={busyId !== null}
              onClick={() => setEditor({ task: null })}
            >
              <Plus size={18} />
              New task
            </button>
          </div>
          <section className="stats-grid" aria-label="Task summary">
            {[
              {
                label: "Total tasks",
                count: summary.total,
                note: "Everything in one place",
                icon: Layers3,
                id: "all",
              },
              {
                label: "In progress",
                count: summary.inProgress,
                note: "You’re moving forward",
                icon: Clock3,
                id: "inProgress",
              },
              {
                label: "Completed",
                count: completed,
                note: "Small wins add up",
                icon: CheckCheck,
                id: "done",
              },
              {
                label: "Overdue",
                count: overdue,
                note: "A little attention needed",
                icon: CalendarDays,
                id: "overdue",
              },
            ].map(({ label, count, note, icon: Icon, id }) => (
              <button
                key={id}
                className={`stat-card stat-${id}`}
                disabled={busyId !== null}
                onClick={() => changeFilter(id)}
              >
                <div>
                  <span>{label}</span>
                  <Icon size={19} />
                </div>
                <strong>{loading ? "—" : count}</strong>
                <small>{note}</small>
              </button>
            ))}
          </section>
          <section className="task-section" aria-labelledby="tasks-heading">
            <div className="section-heading">
              <h2 id="tasks-heading">
                {filter === "overdue"
                  ? "Overdue tasks"
                  : filter === "all"
                    ? "Your tasks"
                    : statusLabels[filter as keyof typeof statusLabels]}
                <span>{total}</span>
              </h2>
              <span className="section-caption">
                Clear your mind. Capture a task.
              </span>
            </div>
            <div className="task-toolbar">
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="Search tasks"
                  placeholder="Search your tasks…"
                  value={searchInput}
                  disabled={busyId !== null}
                  maxLength={120}
                  onChange={(event) => {
                    setLoading(true);
                    invalidateRequests();
                    setSearchInput(event.target.value);
                  }}
                />
              </label>
              <select
                aria-label="Filter by priority"
                value={priority}
                disabled={busyId !== null}
                onChange={(event) => {
                  setLoading(true);
                  setPage(1);
                  setPriority(event.target.value);
                }}
              >
                <option value="all">All priorities</option>
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
              <select
                aria-label="Sort tasks"
                value={sort}
                disabled={busyId !== null}
                onChange={(event) => {
                  setLoading(true);
                  setPage(1);
                  setSort(event.target.value);
                }}
              >
                <option value="newest">Newest first</option>
                <option value="dueDate">Due date</option>
                <option value="priority">Priority</option>
              </select>
            </div>
            {error && (
              <div role="alert" className="error-banner">
                {error}
                <button onClick={load}>Retry</button>
              </div>
            )}
            <div role="status" className="sr-only">
              {notice}
            </div>
            {loading ? (
              <div className="empty-state" role="status">
                <span className="loading-dot" />
                Gathering your tasks…
              </div>
            ) : visible.length ? (
              <div className="task-list">
                {visible.map((task) => (
                  <article
                    key={task.id}
                    className={`task-row ${task.status === "done" ? "is-done" : ""}`}
                  >
                    <button
                      className={`task-check ${task.status === "done" ? "checked" : ""}`}
                      disabled={busyId !== null}
                      aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                      onClick={() => toggle(task)}
                    >
                      {task.status === "done" && <Check size={15} />}
                    </button>
                    <div className="task-content">
                      <button
                        className="task-title"
                        disabled={busyId !== null}
                        onClick={() => setEditor({ task })}
                      >
                        {task.title}
                      </button>
                      {task.description && <p>{task.description}</p>}
                      <div className="task-meta">
                        <span className={`status-pill ${task.status}`}>
                          {statusLabels[task.status]}
                        </span>
                        {task.dueDate && (
                          <span
                            className={
                              task.dueDate < today && task.status !== "done"
                                ? "overdue-text"
                                : ""
                            }
                          >
                            <CalendarDays size={13} />
                            {new Date(
                              `${task.dueDate}T12:00:00`,
                            ).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`badge ${task.priority}`}>
                      {task.priority}
                    </span>
                    <div className="task-actions">
                      <button
                        className="icon-button"
                        aria-label={`Edit ${task.title}`}
                        disabled={busyId !== null}
                        onClick={() => setEditor({ task })}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button delete-button"
                        aria-label={`Delete ${task.title}`}
                        disabled={busyId !== null}
                        onClick={() => remove(task)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              !error && (
                <div className="empty-state">
                  <span className="empty-icon">
                    <CheckCheck size={30} />
                  </span>
                  <h3>
                    {summary.total
                      ? "A clear view."
                      : "Big things start with a small task."}
                  </h3>
                  <p>
                    {summary.total
                      ? "No tasks match this view. Try another filter or search."
                      : "Add your first task and give your day a little direction."}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      summary.total
                        ? (changeFilter("all"),
                          setSearchInput(""),
                          setSearch(""),
                          setPriority("all"))
                        : setEditor({ task: null })
                    }
                  >
                    {summary.total ? "Clear filters" : "Create your first task"}
                    <Plus size={16} />
                  </button>
                </div>
              )
            )}
            <footer className="list-footer pagination-footer">
              <span>
                {total === 0
                  ? "0 tasks"
                  : (page - 1) * pageSize +
                    1 +
                    "–" +
                    Math.min(page * pageSize, total) +
                    " of " +
                    total +
                    " tasks"}
              </span>
              <nav className="pagination-controls" aria-label="Task pagination">
                <button
                  className="secondary-button"
                  disabled={loading || busyId !== null || page <= 1}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value - 1);
                  }}
                >
                  Previous
                </button>
                <span aria-live="polite">
                  Page {page} of {pageCount}
                </span>
                <button
                  className="secondary-button"
                  disabled={loading || busyId !== null || page >= pageCount}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value + 1);
                  }}
                >
                  Next
                </button>
              </nav>
            </footer>
          </section>
          <p className="workspace-footer">Progress, at your pace.</p>
        </main>
      </div>
      <div className="undo-notices" aria-label="Recently deleted tasks">
        {deletedTasks.map((task) => (
          <UndoDeleteNotice
            key={task.id}
            task={task}
            pending={busyId !== null}
            onUndo={restore}
            onExpire={dismissUndo}
          />
        ))}
      </div>
      {editor && (
        <TaskForm
          task={editor.task}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
