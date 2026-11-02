"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function EmailOtpForm({ googlePending }: { googlePending: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    expiresAt: number;
  } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(
      () =>
        setRemaining(
          Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000)),
        ),
      250,
    );
    return () => window.clearInterval(timer);
  }, [challenge]);
  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setPending(true);
    setError("");
    setCode("");
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Couldn't send your code.");
      setChallenge(body);
      setRemaining(
        Math.max(0, Math.ceil((body.expiresAt - Date.now()) / 1000)),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Couldn't send your code.",
      );
    } finally {
      setPending(false);
    }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setPending(true);
    setError("");
    try {
      const result = await signIn("email-otp", {
        email,
        code,
        challengeId: challenge.challengeId,
        redirect: false,
        callbackUrl: "/",
      });
      if (!result?.ok || result.error)
        throw new Error(
          result?.error === "CredentialsSignin"
            ? "That code is incorrect, expired, or has already been used."
            : "Sign-in is temporarily unavailable. Please try again shortly.",
        );
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Couldn't verify your code.",
      );
      setPending(false);
    }
  }
  return (
    <section className="email-login" aria-label="Email sign-in">
      <div className="email-login-separator">
        <span />
        or continue with email
        <span />
      </div>
      {!challenge ? (
        <form onSubmit={sendCode}>
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            disabled={pending || googlePending}
          />
          <button
            className="primary-button"
            disabled={pending || googlePending}
          >
            {pending ? "Sending code…" : "Send sign-in code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p>
            Enter the 6-digit code sent to <strong>{email}</strong>.
          </p>
          <label htmlFor="login-code">Sign-in code</label>
          <input
            id="login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            disabled={pending || googlePending || remaining === 0}
          />
          <small role="status">
            {remaining > 0
              ? `Code expires in ${remaining}s`
              : "Code expired. Request a new one."}
          </small>
          <button
            className="primary-button"
            disabled={pending || googlePending || remaining === 0}
          >
            {pending ? "Verifying…" : "Verify and sign in"}
          </button>
          <div className="email-login-actions">
            <button
              type="button"
              disabled={pending || googlePending || remaining > 0}
              onClick={() => void sendCode()}
            >
              Resend code
            </button>
            <button
              type="button"
              disabled={pending || googlePending}
              onClick={() => {
                setChallenge(null);
                setCode("");
                setError("");
              }}
            >
              Change email
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
