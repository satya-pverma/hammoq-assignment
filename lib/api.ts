import "server-only";
import { getServerSession } from "next-auth";
import { authOptions, isAuthConfigured } from "./auth";
export async function getOwnerId() {
  if (!isAuthConfigured()) return undefined;
  return (await getServerSession(authOptions))?.user?.id;
}
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(
    origin &&
    process.env.NEXTAUTH_URL &&
    origin === new URL(process.env.NEXTAUTH_URL).origin,
  );
}
export function serviceError(error: unknown) {
  console.error(
    "Task request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    { error: "We couldn't reach your tasks. Please try again." },
    { status: 503 },
  );
}
export async function parseTaskBody(request: Request) {
  const body = await request.text();
  if (body.length > 16000) throw new Error("RequestTooLarge");
  return JSON.parse(body) as unknown;
}
