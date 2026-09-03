import { database, repository, syntheticOwnerId } from "@/application/server";
import { ManualDataWorkspace } from "@/components/manual-data-workspace";

export const dynamic = "force-dynamic";

export default function SupplementalDataPage() {
  const recruiters = repository.listRecruiters(syntheticOwnerId).map((item) => ({
    id: item.id,
    name: item.canonicalName,
  }));
  const organizations = database.sqlite
    .prepare(
      "select id, display_name as name from organizations where owner_id = ? order by display_name",
    )
    .all(syntheticOwnerId) as Array<{ id: string; name: string }>;
  return (
    <div className="page-stack">
      <section className="page-heading">
        <p className="eyebrow">Supplemental data</p>
        <h1>Add facts you control</h1>
        <p>Create records locally. Nothing is fetched, sent, or enriched.</p>
      </section>
      <ManualDataWorkspace recruiters={recruiters} organizations={organizations} />
    </div>
  );
}
