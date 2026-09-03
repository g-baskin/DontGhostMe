import type { Metadata, Route } from "next";
import Link from "next/link";
import { repository, syntheticOwnerId } from "@/application/server";
import type { CursorPage } from "@/domain/models";
import type { RecruiterFilters, RecruiterSummary } from "@/domain/repositories";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Recruiters" };
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const statuses = new Set(["active", "dormant", "do_not_contact"]);
const booleanValue = (value: string | undefined): boolean => value === "1";

export default async function RecruitersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const filters: RecruiterFilters = {
    search: query.search,
    status:
      query.status && statuses.has(query.status)
        ? (query.status as RecruiterFilters["status"])
        : undefined,
    unresolved: booleanValue(query.unresolved),
    possibleCompanyChange: booleanValue(query.companyChange),
    excluded: booleanValue(query.excluded),
    cursor: query.cursor,
    direction: query.direction === "previous" ? "previous" : "next",
  };
  let page: CursorPage<RecruiterSummary> = { items: [], nextCursor: null, previousCursor: null };
  let queryError = false;
  try {
    page = repository.queryRecruiters(syntheticOwnerId, filters);
  } catch {
    queryError = true;
  }
  const paramsFor = (cursor: string, direction: "next" | "previous") => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value && key !== "cursor" && key !== "direction") params.set(key, value);
    params.set("cursor", cursor);
    params.set("direction", direction);
    return `/recruiters?${params}` as Route;
  };
  return (
    <>
      <header className="page-heading">
        <h1>Recruiters</h1>
        <p>
          Search relationship history while evidence, exclusions, and your status choices stay
          separate.
        </p>
      </header>
      <search>
        <form className="filter-form" method="get">
          <label htmlFor="recruiter-search">Search names, emails, or accepted companies</label>
          <input id="recruiter-search" name="search" type="search" defaultValue={query.search} />
          <label htmlFor="relationship-filter">Status</label>
          <select id="relationship-filter" name="status" defaultValue={query.status ?? ""}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="dormant">Dormant</option>
            <option value="do_not_contact">Do not contact</option>
          </select>
          <label>
            <input
              type="checkbox"
              name="unresolved"
              value="1"
              defaultChecked={filters.unresolved}
            />{" "}
            Needs review
          </label>
          <label>
            <input
              type="checkbox"
              name="companyChange"
              value="1"
              defaultChecked={filters.possibleCompanyChange}
            />{" "}
            Possible company change
          </label>
          <label>
            <input type="checkbox" name="excluded" value="1" defaultChecked={filters.excluded} />{" "}
            Show only excluded
          </label>
          <div className="button-row">
            <button type="submit">Apply filters</button>
            <Link href="/recruiters">Reset filters</Link>
          </div>
        </form>
      </search>
      {queryError ? (
        <p className="form-message error" role="alert">
          The filters or page link were invalid. Reset filters and try again.
        </p>
      ) : null}
      <p className="source-note" aria-live="polite">
        {page.items.length} recruiter{page.items.length === 1 ? "" : "s"} shown.
      </p>
      {page.items.length ? (
        <ul className="record-list">
          {page.items.map((recruiter) => (
            <li className="record" key={recruiter.id}>
              <h2>
                <Link href={`/recruiters/${recruiter.id}`}>{recruiter.canonicalName}</Link>
              </h2>
              <dl>
                <dt>Status</dt>
                <dd>{recruiter.relationshipStatus?.replaceAll("_", " ") ?? "Unset"}</dd>
                <dt>Affiliation</dt>
                <dd>{recruiter.currentAffiliation}</dd>
                <dt>Last contact</dt>
                <dd>
                  {recruiter.lastContact === "Unknown"
                    ? "Unknown"
                    : date.format(new Date(recruiter.lastContact))}
                </dd>
                <dt>Needs review</dt>
                <dd>{recruiter.unresolvedItems}</dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <section className="empty-state">
          <h2>No recruiters match</h2>
          <p>The current search and filter combination returned no records.</p>
          <Link href="/recruiters">Reset all filters</Link>
        </section>
      )}
      <nav className="pagination" aria-label="Recruiter results pages">
        {page.previousCursor ? (
          <Link href={paramsFor(page.previousCursor, "previous")}>Previous page</Link>
        ) : (
          <span>Previous page unavailable</span>
        )}
        {page.nextCursor ? (
          <Link href={paramsFor(page.nextCursor, "next")}>Next page</Link>
        ) : (
          <span>Next page unavailable</span>
        )}
      </nav>
    </>
  );
}
