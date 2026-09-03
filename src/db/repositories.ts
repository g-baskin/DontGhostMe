import { randomUUID } from "node:crypto";
import { deriveRecruiterMetrics } from "@/domain/metrics";
import type {
  MessageDirection,
  Opportunity,
  ReviewDecision,
  ReviewItem,
  TimelineEvent,
} from "@/domain/models";
import type {
  AppRepository,
  PortableExport,
  RecruiterDetail,
  RecruiterSummary,
} from "@/domain/repositories";
import { deriveReviewState, ReviewConflictError } from "@/domain/reviews";
import type { AppDatabase } from "./client";

interface RecruiterRow {
  id: string;
  owner_id: string;
  canonical_name: string;
}

const exportTableNames = [
  "recruiters",
  "recruiter_identities",
  "recruiter_affiliations",
  "organizations",
  "opportunities",
  "submissions",
  "conversations",
  "conversation_opportunities",
  "communication_events",
  "source_references",
  "evidence_assertions",
  "review_decisions",
  "import_batches",
  "historical_imports",
  "import_checkpoints",
  "import_source_messages",
  "normalized_messages",
  "attachment_inventory",
  "import_errors",
  "owner_email_identities",
  "classification_runs",
  "classification_proposals",
  "classification_evidence",
  "classification_decisions",
] as const;

type ExportTableName = (typeof exportTableNames)[number];

function isExportTableName(table: string): table is ExportTableName {
  return exportTableNames.includes(table as ExportTableName);
}

function all<T>(database: AppDatabase, query: string, ...parameters: unknown[]): T[] {
  return database.sqlite.prepare(query).all(...parameters) as T[];
}

function one<T>(database: AppDatabase, query: string, ...parameters: unknown[]): T | undefined {
  return database.sqlite.prepare(query).get(...parameters) as T | undefined;
}

function acceptedAffiliations(database: AppDatabase, ownerId: string, recruiterId: string) {
  return all<{ name: string; valid_from: string; valid_to: string | null }>(
    database,
    `select o.display_name as name, ra.valid_from, ra.valid_to
     from recruiter_affiliations ra
     join organizations o on o.id = ra.organization_id and o.owner_id = ra.owner_id
     left join evidence_assertions ea on ea.affiliation_id = ra.id and ea.owner_id = ra.owner_id
     left join review_decisions rd on rd.id = (
       select latest.id from review_decisions latest
       where latest.owner_id = ra.owner_id and latest.assertion_id = ea.id
       order by latest.revision desc limit 1
     )
     where ra.owner_id = ? and ra.recruiter_id = ?
       and (ea.id is null or rd.decision in ('confirmed', 'corrected'))
     order by ra.valid_from`,
    ownerId,
    recruiterId,
  );
}

function buildSummary(
  database: AppDatabase,
  ownerId: string,
  recruiter: RecruiterRow,
): RecruiterSummary {
  const identities = all<{
    id: string;
    normalized_email: string;
    valid_from: string;
    valid_to: string | null;
  }>(
    database,
    `select id, normalized_email, valid_from, valid_to from recruiter_identities
     where owner_id = ? and recruiter_id = ? order by valid_from`,
    ownerId,
    recruiter.id,
  ).map((identity) => ({
    id: identity.id,
    ownerId,
    recruiterId: recruiter.id,
    email: identity.normalized_email,
    validFrom: identity.valid_from,
    validTo: identity.valid_to,
  }));
  const affiliations = acceptedAffiliations(database, ownerId, recruiter.id);
  const lastContact = one<{ occurred_at: string }>(
    database,
    `select ce.occurred_at from communication_events ce
     join conversations c on c.id = ce.conversation_id and c.owner_id = ce.owner_id
     where ce.owner_id = ? and c.recruiter_id = ? order by ce.occurred_at desc limit 1`,
    ownerId,
    recruiter.id,
  );
  const unresolved = one<{ count: number }>(
    database,
    `select count(*) as count from evidence_assertions ea
     where ea.owner_id = ? and ea.recruiter_id = ? and ea.review_requirement = 'user_review'
       and not exists (
         select 1 from review_decisions rd
         where rd.owner_id = ea.owner_id and rd.assertion_id = ea.id
       )`,
    ownerId,
    recruiter.id,
  );

  return {
    id: recruiter.id,
    ownerId,
    canonicalName: recruiter.canonical_name,
    identities,
    firstAffiliation: affiliations[0]?.name ?? "Unknown",
    currentAffiliation: affiliations.at(-1)?.name ?? "Unconfirmed",
    lastContact: lastContact?.occurred_at ?? "Unknown",
    unresolvedItems: unresolved?.count ?? 0,
  };
}

function toOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    recruiterId: String(row.recruiter_id),
    staffingOrganizationId: String(row.staffing_organization_id),
    endClientOrganizationId: row.end_client_organization_id
      ? String(row.end_client_organization_id)
      : null,
    title: String(row.title),
    sourceKey: String(row.source_key),
    introducedAt: String(row.introduced_at),
  };
}

export function createRepository(database: AppDatabase): AppRepository {
  return {
    getHome(ownerId) {
      const recruiter = one<RecruiterRow>(
        database,
        "select id, owner_id, canonical_name from recruiters where owner_id = ? order by created_at limit 1",
        ownerId,
      );
      if (!recruiter) throw new Error("Synthetic recruiter data is not seeded");
      const detail = this.getRecruiter(ownerId, recruiter.id);
      if (!detail) throw new Error("Synthetic recruiter data is not seeded");
      return detail;
    },

    listRecruiters(ownerId) {
      return all<RecruiterRow>(
        database,
        "select id, owner_id, canonical_name from recruiters where owner_id = ? order by canonical_name",
        ownerId,
      ).map((recruiter) => buildSummary(database, ownerId, recruiter));
    },

    getRecruiter(ownerId, recruiterId) {
      const recruiter = one<RecruiterRow>(
        database,
        "select id, owner_id, canonical_name from recruiters where owner_id = ? and id = ?",
        ownerId,
        recruiterId,
      );
      if (!recruiter) return null;

      const timelineRows = all<{
        id: string;
        occurred_at: string;
        direction: MessageDirection;
        subject: string;
        content: string;
        source_key: string;
        conversation_id: string;
      }>(
        database,
        `select ce.id, ce.occurred_at, ce.direction, c.subject, sr.content, sr.source_key,
                ce.conversation_id
         from communication_events ce
         join conversations c on c.id = ce.conversation_id and c.owner_id = ce.owner_id
         join source_references sr on sr.id = ce.source_reference_id and sr.owner_id = ce.owner_id
         where ce.owner_id = ? and c.recruiter_id = ?
         order by ce.occurred_at, ce.id`,
        ownerId,
        recruiterId,
      );
      const timeline: TimelineEvent[] = timelineRows.map((event) => {
        const assertion = one<{ confidence_basis_points: number; inferred: number }>(
          database,
          `select confidence_basis_points, inferred from evidence_assertions
           where owner_id = ? and source_reference_id = (
             select source_reference_id from communication_events where owner_id = ? and id = ?
           ) order by confidence_basis_points desc limit 1`,
          ownerId,
          ownerId,
          event.id,
        );
        return {
          id: event.id,
          occurredAt: event.occurred_at,
          direction: event.direction,
          subject: event.subject,
          excerpt: event.content,
          sourceKey: event.source_key,
          confidenceBasisPoints: assertion?.confidence_basis_points ?? 10000,
          inferred: Boolean(assertion?.inferred),
        };
      });
      const opportunityRows = all<Record<string, unknown>>(
        database,
        "select * from opportunities where owner_id = ? and recruiter_id = ? order by introduced_at",
        ownerId,
        recruiterId,
      );
      const opportunities = opportunityRows.map(toOpportunity);
      const metricOpportunities = opportunities.map((opportunity) => ({
        submitted: Boolean(
          one(
            database,
            "select 1 from submissions where owner_id = ? and opportunity_id = ?",
            ownerId,
            opportunity.id,
          ),
        ),
        outcomeKnown: false,
      }));
      return {
        ...buildSummary(database, ownerId, recruiter),
        timeline,
        opportunities,
        metrics: deriveRecruiterMetrics(
          timelineRows.map((event) => ({
            occurredAt: event.occurred_at,
            direction: event.direction,
            conversationId: event.conversation_id,
          })),
          metricOpportunities,
        ),
      } satisfies RecruiterDetail;
    },

    listOpportunities(ownerId) {
      return all<Record<string, unknown>>(
        database,
        `select p.*, staffing.display_name as staffing_name, client.display_name as client_name,
                case when s.id is null then 0 else 1 end as submitted
         from opportunities p
         join organizations staffing
           on staffing.id = p.staffing_organization_id and staffing.owner_id = p.owner_id
         left join organizations client
           on client.id = p.end_client_organization_id and client.owner_id = p.owner_id
         left join submissions s on s.opportunity_id = p.id and s.owner_id = p.owner_id
         where p.owner_id = ? order by p.introduced_at`,
        ownerId,
      ).map((row) => ({
        ...toOpportunity(row),
        staffingOrganization: String(row.staffing_name),
        endClientOrganization: row.client_name ? String(row.client_name) : null,
        submitted: Boolean(row.submitted),
        outcome: row.submitted ? "unknown" : "not_started",
      }));
    },

    listReviewItems(ownerId) {
      const rows = all<{
        id: string;
        recruiter_id: string;
        fact_type: string;
        canonical_value_json: string;
        excerpt: string;
        confidence_basis_points: number;
        source_key: string;
        review_requirement: "none" | "user_review";
        decision: ReviewDecision | null;
        revision: number | null;
      }>(
        database,
        `select ea.id, ea.recruiter_id, ea.fact_type, ea.canonical_value_json, ea.excerpt,
                ea.confidence_basis_points, sr.source_key, ea.review_requirement,
                rd.decision, rd.revision
         from evidence_assertions ea
         join source_references sr on sr.id = ea.source_reference_id and sr.owner_id = ea.owner_id
         left join review_decisions rd on rd.id = (
           select latest.id from review_decisions latest
           where latest.owner_id = ea.owner_id and latest.assertion_id = ea.id
           order by latest.revision desc limit 1
         )
         where ea.owner_id = ? and ea.review_requirement = 'user_review'
         order by ea.occurred_at`,
        ownerId,
      );
      return rows.map(
        (row): ReviewItem => ({
          assertionId: row.id,
          recruiterId: row.recruiter_id,
          factType: row.fact_type,
          value: JSON.parse(row.canonical_value_json),
          excerpt: row.excerpt,
          confidenceBasisPoints: row.confidence_basis_points,
          sourceKey: row.source_key,
          state: deriveReviewState(row.review_requirement, row.decision ?? undefined),
          revision: row.revision ?? 0,
        }),
      );
    },

    decide(ownerId, assertionId, expectedRevision, decision) {
      database.sqlite.exec("BEGIN IMMEDIATE");
      try {
        const assertion = one<{ id: string }>(
          database,
          "select id from evidence_assertions where owner_id = ? and id = ? and review_requirement = 'user_review'",
          ownerId,
          assertionId,
        );
        if (!assertion) throw new Error("Review item not found");
        const latest = one<{ revision: number }>(
          database,
          "select revision from review_decisions where owner_id = ? and assertion_id = ? order by revision desc limit 1",
          ownerId,
          assertionId,
        );
        const currentRevision = latest?.revision ?? 0;
        if (currentRevision !== expectedRevision) throw new ReviewConflictError();
        const revision = currentRevision + 1;
        database.sqlite
          .prepare(
            `insert into review_decisions
             (id, owner_id, assertion_id, revision, decision, corrected_value_json, created_at)
             values (?, ?, ?, ?, ?, null, ?)`,
          )
          .run(randomUUID(), ownerId, assertionId, revision, decision, new Date().toISOString());
        database.sqlite.exec("COMMIT");
        return { revision };
      } catch (error) {
        if (database.sqlite.inTransaction) database.sqlite.exec("ROLLBACK");
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "SQLITE_CONSTRAINT_UNIQUE"
        ) {
          throw new ReviewConflictError();
        }
        throw error;
      }
    },

    exportData(ownerId, exportedAt) {
      const owner = one<{ id: string; display_name: string }>(
        database,
        "select id, display_name from owners where id = ?",
        ownerId,
      );
      if (!owner) throw new Error("Owner not found");
      const scoped = (table: string) => {
        if (!isExportTableName(table)) throw new Error("Unsupported export table");
        return all<unknown>(database, `select * from ${table} where owner_id = ?`, ownerId);
      };
      return {
        exportedAt,
        formatVersion: 1,
        owner: { id: owner.id, displayName: owner.display_name },
        recruiters: scoped("recruiters"),
        recruiterIdentities: scoped("recruiter_identities"),
        recruiterAffiliations: scoped("recruiter_affiliations"),
        organizations: scoped("organizations"),
        opportunities: scoped("opportunities"),
        submissions: scoped("submissions"),
        conversations: scoped("conversations"),
        conversationOpportunities: scoped("conversation_opportunities"),
        communications: scoped("communication_events"),
        sourceReferences: scoped("source_references"),
        evidence: scoped("evidence_assertions").map((value) => {
          const row = value as Record<string, unknown>;
          return {
            ...row,
            canonical_value: JSON.parse(String(row.canonical_value_json)),
            canonical_value_json: undefined,
          };
        }),
        reviewHistory: scoped("review_decisions"),
        importBatches: scoped("import_batches"),
        historicalImports: scoped("historical_imports"),
        importCheckpoints: scoped("import_checkpoints"),
        importSourceMessages: scoped("import_source_messages"),
        normalizedMessages: scoped("normalized_messages"),
        attachmentInventory: scoped("attachment_inventory"),
        importErrors: scoped("import_errors"),
        ownerEmailIdentities: scoped("owner_email_identities"),
        classificationRuns: scoped("classification_runs"),
        classificationProposals: scoped("classification_proposals"),
        classificationEvidence: scoped("classification_evidence"),
        classificationDecisions: scoped("classification_decisions"),
      } satisfies PortableExport;
    },
  };
}
