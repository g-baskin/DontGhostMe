import type { TimelineEvent } from "@/domain/models";

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function EvidenceTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="evidence-timeline">
      {events.map((event) => {
        const confidence = event.confidenceBasisPoints / 100;
        return (
          <li key={event.id}>
            <article>
              <div className="timeline-heading">
                <h3>{event.subject}</h3>
                <span className="direction">
                  {event.direction === "recruiter_to_candidate"
                    ? "Recruiter to candidate"
                    : "Candidate to recruiter"}
                </span>
              </div>
              <time dateTime={event.occurredAt}>{dateTime.format(new Date(event.occurredAt))}</time>
              <p>{event.excerpt}</p>
              <details>
                <summary>Inspect source evidence</summary>
                <div className="evidence-box">
                  <p>
                    <strong>Source:</strong> {event.sourceKey}
                  </p>
                  <p>
                    <strong>Basis:</strong> {event.inferred ? "Inferred fact" : "Direct source"}
                  </p>
                  <label>
                    Confidence: {confidence}%
                    <meter min="0" max="100" value={confidence}>
                      {confidence}%
                    </meter>
                  </label>
                  <blockquote>{event.excerpt}</blockquote>
                </div>
              </details>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
