import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { repository, syntheticOwnerId } from "@/application/server";
import { DeleteRecruiterForm } from "@/components/delete-recruiter-form";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Delete recruiter data" };

export default async function DeleteRecruiterPage({
  params,
}: {
  params: Promise<{ recruiterId: string }>;
}) {
  const { recruiterId } = await params;
  const recruiter = repository.getRecruiter(syntheticOwnerId, recruiterId);
  if (!recruiter) notFound();
  return (
    <>
      <header className="page-heading">
        <h1>Delete {recruiter.canonicalName}&apos;s derived data</h1>
        <p>This cannot be undone. Source messages and a non-personal audit record remain.</p>
      </header>
      <section className="section reading-width" aria-labelledby="deletion-scope">
        <h2 className="section-heading" id="deletion-scope">
          Deletion scope
        </h2>
        <ul>
          <li>
            Removes recruiter identities, affiliations, opportunities, conversations, metrics, and
            decisions.
          </li>
          <li>Does not remove source messages or unrelated imports.</li>
          <li>Records only owner ID, recruiter ID, timestamp, scope, and a name hash.</li>
        </ul>
        <DeleteRecruiterForm recruiterId={recruiter.id} recruiterName={recruiter.canonicalName} />
        <Link href={`/recruiters/${recruiter.id}`}>Cancel and return to recruiter</Link>
      </section>
    </>
  );
}
