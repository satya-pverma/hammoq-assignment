import { Suspense } from "react";
import { connection } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAuthConfigured, isGoogleConfigured } from "@/lib/auth";
import { isOtpConfigured } from "@/lib/email-otp";
import { Login } from "@/components/login";
import { TaskWorkspace } from "@/components/task-workspace";
async function Workspace() {
  await connection();
  const login = (
    <Login
      googleConfigured={isGoogleConfigured()}
      otpConfigured={isAuthConfigured() && isOtpConfigured()}
    />
  );
  if (!isAuthConfigured()) return login;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return login;
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
