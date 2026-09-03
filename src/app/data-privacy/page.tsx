import type { Metadata, Route } from "next";
import Link from "next/link";
import { exportData } from "@/application/export-data";
import { repository, syntheticOwnerId } from "@/application/server";
import { DomainExclusionForm } from "@/components/domain-exclusion-form";
import { ExclusionRestoreForm } from "@/components/exclusion-restore-form";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Data & Privacy" };

export default async function DataPrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const data = exportData(repository, syntheticOwnerId);
  const recruiters = repository.queryRecruiters(syntheticOwnerId, {
    excluded: true,
    limit: 100,
  }).items;
  const exclusions = data.identityExclusions as Record<string, unknown>[];
  return (
    <>
      <header className="page-heading">
        {deleted === "1" ? (
          <div className="notice" role="status">
            Recruiter-derived data deleted. Source messages remain.
          </div>
        ) : null}
        <h1>Data & Privacy</h1>
        <p>
          Your local records remain inspectable, portable, reversible where possible, and deletable
          by scope.
        </p>
      </header>
      <section className="section" aria-labelledby="data-inventory">
        <h2 className="section-heading" id="data-inventory">
          Local data inventory
        </h2>
        <dl className="metric-ledger">
          <div>
            <dt>Recruiters</dt>
            <dd>{data.recruiters.length}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{data.communications.length}</dd>
          </div>
          <div>
            <dt>Evidence assertions</dt>
            <dd>{data.evidence.length}</dd>
          </div>
          <div>
            <dt>Exclusions</dt>
            <dd>{exclusions.length}</dd>
          </div>
        </dl>
      </section>
      <section className="section reading-width" aria-labelledby="exclusions">
        <h2 className="section-heading" id="exclusions">
          Reversible exclusions
        </h2>
        <p>
          Exclusions hide records from default views. They do not delete source, evidence, or
          decisions.
        </p>
        <DomainExclusionForm />
        {recruiters.length ? (
          <ul>
            {recruiters.map((recruiter) => (
              <li key={recruiter.id}>
                <Link href={`/recruiters/${recruiter.id}`}>{recruiter.canonicalName}</Link>:
                excluded, open to restore
              </li>
            ))}
          </ul>
        ) : (
          <p>No recruiters are currently excluded.</p>
        )}
        {exclusions.length ? (
          <ul>
            {exclusions.map((exclusion) => (
              <li key={String(exclusion.id)}>
                <ExclusionRestoreForm
                  exclusionId={String(exclusion.id)}
                  label={
                    exclusion.domain
                      ? `Domain: ${exclusion.domain}`
                      : `Sender identity: ${exclusion.identity_id}`
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p>No sender or domain exclusions.</p>
        )}
      </section>
      <section className="section reading-width" aria-labelledby="deletion-choices">
        <h2 className="section-heading" id="deletion-choices">
          Deletion choices
        </h2>
        <dl>
          <dt>
            <strong>Recruiter-derived deletion</strong>
          </dt>
          <dd>
            Removes one recruiter&apos;s derived relationship data while preserving source messages.
          </dd>
          <dt>
            <strong>Import deletion</strong>
          </dt>
          <dd>Removes one historical import through its separate import controls.</dd>
          <dt>
            <strong>Full export</strong>
          </dt>
          <dd>
            Downloads all owner-scoped records, including excluded records and deletion audit
            metadata.
          </dd>
        </dl>
        {(data.recruiters as Record<string, unknown>[]).map((recruiter) => (
          <p key={String(recruiter.id)}>
            <Link href={`/recruiters/${String(recruiter.id)}/delete` as Route}>
              Review deletion for {String(recruiter.canonical_name)}
            </Link>
          </p>
        ))}
      </section>
      <section className="section reading-width" aria-labelledby="network-boundary">
        <h2 className="section-heading" id="network-boundary">
          Network boundary
        </h2>
        <p>
          The app has no Gmail, LinkedIn, AI, analytics, telemetry, or outbound communication
          connection. It uses local SQLite.
        </p>
      </section>
      <section className="section reading-width" aria-labelledby="portable-copy">
        <h2 className="section-heading" id="portable-copy">
          Portable copy
        </h2>
        <p>
          The JSON includes normalized records, evidence linkage, relationship statuses, exclusions,
          and deletion audits.
        </p>
        <p>
          <Link className="export-link" href="/api/export" download>
            Download complete portable JSON
          </Link>
        </p>
      </section>
    </>
  );
}
