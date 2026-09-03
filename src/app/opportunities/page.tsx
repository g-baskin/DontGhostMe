import type { Metadata } from "next";
import { getOpportunities } from "@/application/get-opportunities";
import { repository, syntheticOwnerId } from "@/application/server";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Opportunities" };

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function OpportunitiesPage() {
  const opportunities = getOpportunities(repository, syntheticOwnerId);
  return (
    <>
      <header className="page-heading">
        <h1>Opportunities</h1>
        <p>Requests for a resume or right-to-represent never count as a submission.</p>
      </header>
      <ul className="record-list">
        {opportunities.map((opportunity) => (
          <li className="record" key={opportunity.id}>
            <h2>{opportunity.title}</h2>
            <dl>
              <dt>Staffing company</dt>
              <dd>{opportunity.staffingOrganization}</dd>
              <dt>End client</dt>
              <dd>{opportunity.endClientOrganization ?? "Not stated"}</dd>
              <dt>Introduced</dt>
              <dd>{date.format(new Date(opportunity.introducedAt))}</dd>
              <dt>Submission</dt>
              <dd>{opportunity.submitted ? "Explicitly submitted" : "No submission documented"}</dd>
              <dt>Outcome</dt>
              <dd>{opportunity.outcome === "unknown" ? "Unknown outcome" : "Not started"}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
