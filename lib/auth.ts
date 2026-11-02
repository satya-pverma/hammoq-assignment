import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { clientIp, isOtpConfigured, verifyEmailOtp } from "./email-otp";
import { resolveWorkspaceUser } from "./workspace-user";
export function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.NEXTAUTH_SECRET &&
    process.env.NEXTAUTH_URL,
  );
}
export function isAuthConfigured() {
  return Boolean(
    process.env.NEXTAUTH_SECRET &&
    process.env.NEXTAUTH_URL &&
    (isGoogleConfigured() || isOtpConfigured()),
  );
}
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    ...(isGoogleConfigured()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          }),
        ]
      : []),
    CredentialsProvider({
      id: "email-otp",
      name: "Email code",
      credentials: {
        email: { type: "email" },
        code: { type: "text" },
        challengeId: { type: "text" },
      },
      async authorize(credentials, request) {
        try {
          const email = await verifyEmailOtp(
            credentials,
            clientIp(request.headers ?? {}),
          );
          return email ? await resolveWorkspaceUser(email) : null;
        } catch {
          throw new Error(
            "Email sign-in is temporarily unavailable. Please try again shortly.",
          );
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 86400 },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ profile, account, user }) {
      if (account?.provider === "email-otp") return Boolean(user?.id);
      return Boolean(
        profile &&
        "email_verified" in profile &&
        profile.email_verified === true,
      );
    },
    async jwt({ token, account, user }) {
      if (account?.provider === "google" && user.email) {
        const workspaceUser = await resolveWorkspaceUser(
          user.email,
          user.name,
          account.providerAccountId,
        );
        token.sub = workspaceUser.id;
        token.email = workspaceUser.email;
        token.name = user.name || workspaceUser.name;
        token.workspaceVersion = 1;
      } else if (account?.provider === "email-otp" && user) {
        token.sub = user.id;
        token.workspaceVersion = 1;
      } else if (token.workspaceVersion !== 1 && token.email && token.sub) {
        // Upgrade existing signed Google sessions without losing their tasks.
        const workspaceUser = await resolveWorkspaceUser(
          token.email,
          token.name,
          token.sub,
        );
        token.sub = workspaceUser.id;
        token.workspaceVersion = 1;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
