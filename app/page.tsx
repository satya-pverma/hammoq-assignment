import { Suspense } from "react";
import { connection } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAuthConfigured } from "@/lib/auth";
import { Login } from "@/components/login";
import { TaskWorkspace } from "@/components/task-workspace";
async function Workspace() {
  await connection();
  if (!isAuthConfigured()) return <Login configured={false} />;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return <Login configured />;
  return <TaskWorkspace name={session.user.name ?? "there"} />;
}
export default function Home() {
  return (
    <Suspense
      fallback={<main className="loading-page">Opening your workspace…</main>}
    >
      <Workspace />
    </Suspense>
  );
}
