import type { Metadata } from "next";
import Link from "next/link";
import { getRecruiters } from "@/application/get-recruiters";
import { repository, syntheticOwnerId } from "@/application/server";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Recruiters" };

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function RecruitersPage() {
  const recruiters = getRecruiters(repository, syntheticOwnerId);
  return (
    <>
      <header className="page-heading">
        <h1>Recruiters</h1>
        <p>Identity and affiliation history stays linked to its evidence, not just a name match.</p>
      </header>
      <ul className="record-list">
        {recruiters.map((recruiter) => (
          <li className="record" key={recruiter.id}>
            <h2>
              <Link href={`/recruiters/${recruiter.id}`}>{recruiter.canonicalName}</Link>
            </h2>
            <dl>
              <dt>Known identities</dt>
              <dd>{recruiter.identities.length}</dd>
              <dt>Affiliation span</dt>
              <dd>
                {recruiter.firstAffiliation} to {recruiter.currentAffiliation}
              </dd>
              <dt>Last contact</dt>
              <dd>{date.format(new Date(recruiter.lastContact))}</dd>
              <dt>Needs review</dt>
              <dd>{recruiter.unresolvedItems}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
