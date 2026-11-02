"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading-page">
      <div className="empty-state">
        <h1>We couldn’t open your workspace.</h1>
        <p>Please try again in a moment.</p>
        <button className="primary-button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
