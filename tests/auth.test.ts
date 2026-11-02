import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/email-otp", () => ({
  clientIp: () => "ip",
  isOtpConfigured: () => true,
  verifyEmailOtp: vi.fn(),
}));
vi.mock("../lib/workspace-user", () => ({ resolveWorkspaceUser: vi.fn() }));
import { authOptions } from "../lib/auth";
import { resolveWorkspaceUser } from "../lib/workspace-user";
describe("Google and OTP authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveWorkspaceUser).mockResolvedValue({
      id: "shared-owner",
      email: "person@example.com",
      name: "Person",
    });
  });
  it("rejects Google identities without a verified email", async () => {
    expect(
      await authOptions.callbacks!.signIn!({
        account: { provider: "google" },
        profile: { email_verified: false },
        user: { id: "google-id" },
      } as never),
    ).toBe(false);
    expect(
      await authOptions.callbacks!.signIn!({
        account: { provider: "google" },
        profile: { email_verified: true },
        user: { id: "google-id" },
      } as never),
    ).toBe(true);
  });
  it("accepts OTP users verified by the credentials provider", async () => {
    expect(
      await authOptions.callbacks!.signIn!({
        account: { provider: "email-otp" },
        user: { id: "shared-owner" },
      } as never),
    ).toBe(true);
  });
  it("uses the shared workspace ID after Google sign-in", async () => {
    const token = await authOptions.callbacks!.jwt!({
      token: {},
      account: { provider: "google", providerAccountId: "google-id" },
      user: { email: "person@example.com", name: "Person" },
    } as never);
    expect(token.sub).toBe("shared-owner");
    expect(resolveWorkspaceUser).toHaveBeenCalledWith(
      "person@example.com",
      "Person",
      "google-id",
    );
  });
  it("upgrades existing Google session IDs while preserving their task ownership", async () => {
    const token = await authOptions.callbacks!.jwt!({
      token: {
        email: "person@example.com",
        name: "Person",
        sub: "legacy-google-id",
      },
    } as never);
    expect(token.sub).toBe("shared-owner");
    expect(resolveWorkspaceUser).toHaveBeenCalledWith(
      "person@example.com",
      "Person",
      "legacy-google-id",
    );
  });
  it("does not repeat identity migration on upgraded sessions", async () => {
    const token = await authOptions.callbacks!.jwt!({
      token: {
        email: "person@example.com",
        sub: "shared-owner",
        workspaceVersion: 1,
      },
    } as never);
    expect(token.sub).toBe("shared-owner");
    expect(resolveWorkspaceUser).not.toHaveBeenCalled();
  });
});
