import type { Metadata, Route } from "next";
import Link from "next/link";
import { repository, syntheticOwnerId } from "@/application/server";
import type { CursorPage } from "@/domain/models";
import type { OpportunityFilters, OpportunitySummary } from "@/domain/repositories";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Opportunities" };
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const stages = new Set([
  "not_started",
  "discussed",
  "resume_requested",
  "right_to_represent",
  "submitted",
  "interview",
  "terminal",
]);
const outcomes = new Set([
  "unknown",
  "rejected",
  "offer",
  "candidate_withdrew",
  "closed_without_outcome",
]);
const label = (value: string) => value.replaceAll("_", " ");

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const filters: OpportunityFilters = {
    stage:
      query.stage && stages.has(query.stage)
        ? (query.stage as OpportunityFilters["stage"])
        : undefined,
    outcome:
      query.outcome && outcomes.has(query.outcome)
        ? (query.outcome as OpportunityFilters["outcome"])
        : undefined,
    cursor: query.cursor,
    direction: query.direction === "previous" ? "previous" : "next",
  };
  let page: CursorPage<OpportunitySummary> = {
    items: [],
    nextCursor: null,
    previousCursor: null,
  };
  let queryError = false;
  try {
    page = repository.queryOpportunities(syntheticOwnerId, filters);
  } catch {
    queryError = true;
  }
  const pageHref = (cursor: string, direction: "next" | "previous") =>
    `/opportunities?${new URLSearchParams({
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      cursor,
      direction,
    })}` as Route;
  return (
    <>
      <header className="page-heading">
        <h1>Opportunities</h1>
        <p>Pipeline stages require accepted evidence. Unknown never means rejected.</p>
      </header>
      <form className="filter-form" method="get">
        <label htmlFor="stage-filter">Pipeline stage</label>
        <select id="stage-filter" name="stage" defaultValue={query.stage ?? ""}>
          <option value="">Any stage</option>
          {[...stages].map((stage) => (
            <option key={stage} value={stage}>
              {label(stage)}
            </option>
          ))}
        </select>
        <label htmlFor="outcome-filter">Outcome</label>
        <select id="outcome-filter" name="outcome" defaultValue={query.outcome ?? ""}>
          <option value="">Any outcome</option>
          {[...outcomes].map((outcome) => (
            <option key={outcome} value={outcome}>
              {label(outcome)}
            </option>
          ))}
        </select>
        <div className="button-row">
          <button type="submit">Apply filters</button>
          <Link href="/opportunities">Reset filters</Link>
        </div>
      </form>
      {queryError ? (
        <p className="form-message error" role="alert">
          The filters or page link were invalid. Reset filters and try again.
        </p>
      ) : null}
      <p className="source-note" aria-live="polite">
        {page.items.length} opportunities shown.
      </p>
      {page.items.length ? (
        <ul className="record-list">
          {page.items.map((opportunity) => (
            <li className="record" key={opportunity.id}>
              <h2>
                <Link href={`/opportunities/${opportunity.id}` as Route}>{opportunity.title}</Link>
              </h2>
              <dl>
                <dt>Stage</dt>
                <dd>{label(opportunity.stage)}</dd>
                <dt>Submission</dt>
                <dd>
                  {opportunity.submitted ? "Explicitly submitted" : "No submission documented"}
                </dd>
                <dt>Outcome</dt>
                <dd>
                  {!opportunity.submitted
                    ? "Not started"
                    : opportunity.outcome === "unknown"
                      ? "Unknown outcome"
                      : label(opportunity.outcome)}
                </dd>
                <dt>Staffing company</dt>
                <dd>{opportunity.staffingOrganization}</dd>
                <dt>End client</dt>
                <dd>{opportunity.endClientOrganization ?? "Not stated"}</dd>
                <dt>Introduced</dt>
                <dd>{date.format(new Date(opportunity.introducedAt))}</dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <section className="empty-state">
          <h2>No opportunities match</h2>
          <p>The current stage and outcome filters returned no records.</p>
          <Link href="/opportunities">Reset all filters</Link>
        </section>
      )}
      <nav className="pagination" aria-label="Opportunity results pages">
        {page.previousCursor ? (
          <Link href={pageHref(page.previousCursor, "previous")}>Previous page</Link>
        ) : (
          <span>Previous page unavailable</span>
        )}
        {page.nextCursor ? (
          <Link href={pageHref(page.nextCursor, "next")}>Next page</Link>
        ) : (
          <span>Next page unavailable</span>
        )}
      </nav>
    </>
  );
}
