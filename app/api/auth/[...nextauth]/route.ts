import NextAuth from "next-auth";
import { authOptions, isAuthConfigured } from "@/lib/auth";
const handler = NextAuth(authOptions);
async function authHandler(...args: Parameters<typeof handler>) {
  if (!isAuthConfigured()) return Response.json({ error: "Sign-in is not configured yet." }, { status: 503 });
  return handler(...args);
}
export { authHandler as GET, authHandler as POST };
