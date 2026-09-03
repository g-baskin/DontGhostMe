"use client";

export default function RecruitersError({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state" role="alert">
      <h1>Recruiter data could not load</h1>
      <p>Your local data was not changed.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
