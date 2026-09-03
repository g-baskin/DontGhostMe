"use client";

export default function OpportunitiesError({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state" role="alert">
      <h1>Opportunity data could not load</h1>
      <p>Your local data was not changed.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
