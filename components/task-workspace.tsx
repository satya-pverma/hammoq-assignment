"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { statusLabels, type Task, type TaskInput } from "@/lib/task-schema";
import { TaskForm } from "./task-form";

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
  const [sort, setSort] = useState("newest");
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTasks(await request<Task[]>("/api/tasks"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      setToday(localDate());
    }, 0);
    const dateTimer = window.setInterval(() => setToday(localDate()), 60000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(dateTimer);
    };
  }, [load]);
  const completed = tasks.filter((task) => task.status === "done").length;
  const overdue = tasks.filter(
    (task) => task.status !== "done" && task.dueDate && task.dueDate < today,
  ).length;
  const visible = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            (filter === "all" ||
              task.status === filter ||
              (filter === "overdue" &&
                task.status !== "done" &&
                task.dueDate &&
                task.dueDate < today)) &&
            (priority === "all" || task.priority === priority) &&
            `${task.title} ${task.description}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "dueDate"
            ? (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
            : sort === "priority"
              ? { high: 0, medium: 1, low: 2 }[a.priority] -
                { high: 0, medium: 1, low: 2 }[b.priority]
              : b.createdAt.localeCompare(a.createdAt),
        ),
    [tasks, filter, priority, search, sort, today],
  );
  async function save(input: TaskInput) {
    const task = await request<Task>(
      editor?.task ? `/api/tasks/${editor.task.id}` : "/api/tasks",
      { method: editor?.task ? "PUT" : "POST", body: JSON.stringify(input) },
    );
    setTasks((current) =>
      editor?.task
        ? current.map((item) => (item.id === task.id ? task : item))
        : [task, ...current],
    );
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
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? updated : item)),
      );
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
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`))
      return;
    setBusyId(task.id);
    setError("");
    try {
      await request(`/api/tasks/${task.id}`, { method: "DELETE" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice("Task deleted.");
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
              count: tasks.length,
            },
            {
              id: "todo",
              label: "To do",
              icon: Circle,
              count: tasks.filter((task) => task.status === "todo").length,
            },
            {
              id: "inProgress",
              label: "In progress",
              icon: Clock3,
              count: tasks.filter((task) => task.status === "inProgress")
                .length,
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
              onClick={() => setFilter(id)}
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
                count: tasks.length,
                note: "Everything in one place",
                icon: Layers3,
                id: "all",
              },
              {
                label: "In progress",
                count: tasks.filter((task) => task.status === "inProgress")
                  .length,
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
                onClick={() => setFilter(id)}
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
                <span>{visible.length}</span>
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
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <select
                aria-label="Filter by priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="all">All priorities</option>
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
              <select
                aria-label="Sort tasks"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
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
                    {tasks.length
                      ? "A clear view."
                      : "Big things start with a small task."}
                  </h3>
                  <p>
                    {tasks.length
                      ? "No tasks match this view. Try another filter or search."
                      : "Add your first task and give your day a little direction."}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      tasks.length
                        ? (setFilter("all"), setSearch(""), setPriority("all"))
                        : setEditor({ task: null })
                    }
                  >
                    {tasks.length ? "Clear filters" : "Create your first task"}
                    <Plus size={16} />
                  </button>
                </div>
              )
            )}
            <footer className="list-footer">
              <span>
                {visible.length} task{visible.length !== 1 ? "s" : ""} in this
                view
              </span>
              <span>
                {completed} of {tasks.length} completed
              </span>
            </footer>
          </section>
          <p className="workspace-footer">Progress, at your pace.</p>
        </main>
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
