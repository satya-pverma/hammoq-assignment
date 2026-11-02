"use client";
import { signIn } from "next-auth/react";
import { ArrowRight, Check, Layers3, ShieldCheck } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function Login({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const params = useSearchParams();
  const authError = params.has("error")
    ? "Sign-in wasn't completed. Please try again, and use a verified Google account."
    : "";
  async function login() {
    setPending(true);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Couldn't start sign-in. Please try again.");
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>{" "}
          tasklane<span className="brand-dot">.</span>
        </Link>
        <div className="story-content">
          <span className="eyebrow">LESS NOISE. MORE PROGRESS.</span>
          <h1>
            Make room for
            <br />
            your best work<span>.</span>
          </h1>
          <p>
            A little structure for everything on your plate.
            <br />
            One calm place to turn plans into progress.
          </p>
          <div className="preview-card">
            <div className="preview-top">
              <span>YOUR DAY, IN FOCUS</span>
              <span className="live-dot" />
            </div>
            <div className="preview-task">
              <span className="preview-check">
                <Check size={16} />
              </span>
              <span>Start with what matters</span>
              <span className="badge high">High</span>
            </div>
            <div className="preview-task">
              <span className="empty-check" />
              <span>Take it one task at a time</span>
              <span className="badge medium">Medium</span>
            </div>
            <div className="preview-progress">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <small>A little progress goes a long way.</small>
          </div>
        </div>
        <p className="story-footer">
          Thoughtfully simple. Purposefully productive.
        </p>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <span className="welcome-icon">
            <Layers3 size={28} />
          </span>
          <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
          <h2>A clearer day starts here.</h2>
          <p>
            Sign in to capture your tasks, find your focus,
            <br />
            and move things forward.
          </p>
          {(error || authError) && (
            <p role="alert" className="error-message">
              {error || authError}
            </p>
          )}
          {!configured && (
            <p className="setup-note">
              Workspace setup is almost ready. Add your Google OAuth credentials
              and session secret using the setup guide in the README.
            </p>
          )}
          <button
            className="google-button"
            disabled={!configured || pending}
            onClick={login}
          >
            <span className="google-g">G</span>
            {pending ? "Connecting…" : "Continue with Google"}
            <ArrowRight size={18} />
          </button>
          <div className="login-divider" />
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <span>
              Your workspace is private.
              <br />
              Only you can access your tasks.
            </span>
          </div>
          <small className="login-footnote">
            No new password. Just your Google account.
          </small>
        </div>
        <span className="panel-footer">
          A little focus. A lot of possibility.
        </span>
      </section>
    </main>
  );
}
