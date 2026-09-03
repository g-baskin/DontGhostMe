import { createHash, randomUUID } from "node:crypto";
import { deriveRecruiterMetrics } from "@/domain/metrics";
import type {
  MessageDirection,
  Opportunity,
  OpportunityOutcome,
  OpportunityStageEvidence,
  RelationshipStatus,
  ReviewDecision,
  ReviewItem,
  TimelineEvent,
} from "@/domain/models";
import { deriveOpportunityStage, deriveOpportunityStageHistory } from "@/domain/opportunity-stages";
import type {
  AppRepository,
  OpportunityFilters,
  OpportunitySummary,
  PortableExport,
  RecruiterDetail,
  RecruiterFilters,
  RecruiterSummary,
} from "@/domain/repositories";
import { deriveReviewState, ReviewConflictError } from "@/domain/reviews";
import type { AppDatabase } from "./client";
import { latestManualAssertion } from "./manual-assertions";

interface RecruiterRow {
  id: string;
  owner_id: string;
  canonical_name: string;
}

interface CursorValue {
  value: string;
  id: string;
}

function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(cursor: string | undefined): CursorValue | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as CursorValue).value !== "string" ||
      typeof (value as CursorValue).id !== "string"
    )
      throw new Error("Invalid cursor");
    return value as CursorValue;
  } catch {
    throw new Error("Invalid pagination cursor");
  }
}

function pageLimit(limit: number | undefined): number {
  return Number.isSafeInteger(limit) && (limit ?? 0) > 0 && (limit ?? 0) <= 100
    ? (limit as number)
    : 25;
}

const acceptedStageFactSql = `(
  select ea.fact_type from evidence_assertions ea
  left join review_decisions rd on rd.id = (
    select latest.id from review_decisions latest
    where latest.owner_id = ea.owner_id and latest.assertion_id = ea.id
    order by latest.revision desc limit 1
  )
  where ea.owner_id = p.owner_id and ea.opportunity_id = p.id
    and (ea.review_requirement = 'none' or rd.decision in ('confirmed', 'corrected'))
    and ea.fact_type in (
      'opportunity_details', 'opportunity_introduced', 'resume_requested', 'resume_received',
      'right_to_represent_requested', 'right_to_represent_confirmed', 'submission_claimed',
      'explicit_submission', 'submission_confirmed_by_user', 'interview_requested',
      'interview_scheduled', 'interview_completed', 'rejection', 'offer',
      'candidate_withdrew', 'opportunity_closed'
    )
  order by ea.occurred_at desc, ea.id desc limit 1
)`;

const opportunityStageSql = `case
  when p.outcome_state <> 'unknown' then 'terminal'
  when ${acceptedStageFactSql} in ('rejection', 'offer', 'candidate_withdrew', 'opportunity_closed') then 'terminal'
  when ${acceptedStageFactSql} in ('interview_requested', 'interview_scheduled', 'interview_completed') then 'interview'
  when ${acceptedStageFactSql} in ('submission_claimed', 'explicit_submission', 'submission_confirmed_by_user') then 'submitted'
  when ${acceptedStageFactSql} in ('right_to_represent_requested', 'right_to_represent_confirmed') then 'right_to_represent'
  when ${acceptedStageFactSql} in ('resume_requested', 'resume_received') then 'resume_requested'
  when ${acceptedStageFactSql} in ('opportunity_details', 'opportunity_introduced') then 'discussed'
  else 'not_started' end`;

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
  "recruiter_relationship_statuses",
  "identity_exclusions",
  "recruiter_deletions",
  "manual_assertions",
  "import_source_records",
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
  const manualName = latestManualAssertion(
    database,
    ownerId,
    "recruiter",
    recruiter.id,
    "canonical_name",
  );
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
  ).map((identity) => {
    const manualEmail = latestManualAssertion(
      database,
      ownerId,
      "recruiter_identity",
      identity.id,
      "email",
    );
    const manualValidFrom = latestManualAssertion(
      database,
      ownerId,
      "recruiter_identity",
      identity.id,
      "valid_from",
    );
    const manualValidTo = latestManualAssertion(
      database,
      ownerId,
      "recruiter_identity",
      identity.id,
      "valid_to",
    );
    return {
      id: identity.id,
      ownerId,
      recruiterId: recruiter.id,
      email: String(manualEmail?.value ?? identity.normalized_email),
      validFrom: String(manualValidFrom?.value ?? identity.valid_from),
      validTo: manualValidTo ? (manualValidTo.value as string | null) : identity.valid_to,
    };
  });
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

  const relationship = one<{ status: RelationshipStatus; excluded_at: string | null }>(
    database,
    "select status, excluded_at from recruiter_relationship_statuses where owner_id = ? and recruiter_id = ?",
    ownerId,
    recruiter.id,
  );
  const excludedIdentity = identities.some((identity) =>
    Boolean(
      one(
        database,
        `select 1 from identity_exclusions where owner_id = ?
         and (identity_id = ? or domain = lower(substr(?, instr(?, '@') + 1))) limit 1`,
        ownerId,
        identity.id,
        identity.email,
        identity.email,
      ),
    ),
  );
  return {
    id: recruiter.id,
    ownerId,
    canonicalName: String(manualName?.value ?? recruiter.canonical_name),
    identities,
    firstAffiliation: affiliations[0]?.name ?? "Unknown",
    currentAffiliation: affiliations.at(-1)?.name ?? "Unconfirmed",
    lastContact: lastContact?.occurred_at ?? "Unknown",
    unresolvedItems: unresolved?.count ?? 0,
    relationshipStatus: relationship?.status ?? null,
    excluded: Boolean(relationship?.excluded_at) || excludedIdentity,
    possibleCompanyChange: affiliations.length > 1,
    provenance: { canonicalName: manualName ? "manual" : "machine" },
    fallbackValues: { canonicalName: manualName ? recruiter.canonical_name : null },
  };
}

function toOpportunity(database: AppDatabase, row: Record<string, unknown>): Opportunity {
  const ownerId = String(row.owner_id);
  const entityId = String(row.id);
  const manual = (field: string) =>
    latestManualAssertion(database, ownerId, "opportunity", entityId, field)?.value;
  return {
    id: entityId,
    ownerId,
    recruiterId: String(row.recruiter_id),
    staffingOrganizationId: String(
      manual("staffing_organization_id") ?? row.staffing_organization_id,
    ),
    endClientOrganizationId:
      manual("end_client_organization_id") === null
        ? null
        : String(manual("end_client_organization_id") ?? row.end_client_organization_id ?? "") ||
          null,
    title: String(manual("title") ?? row.title),
    sourceKey: String(row.source_key),
    introducedAt: String(manual("introduced_at") ?? row.introduced_at),
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
      return this.queryRecruiters(ownerId, { limit: 100 }).items;
    },

    queryRecruiters(ownerId, filters: RecruiterFilters = {}) {
      const cursor = decodeCursor(filters.cursor);
      const limit = pageLimit(filters.limit);
      const clauses = ["r.owner_id = ?"];
      const parameters: unknown[] = [ownerId];
      if (filters.search?.trim()) {
        const search = `%${filters.search.trim().toLocaleLowerCase("en-US")}%`;
        clauses.push(`(lower(r.canonical_name) like ? or exists (
          select 1 from recruiter_identities ri where ri.owner_id = r.owner_id
          and ri.recruiter_id = r.id and lower(ri.normalized_email) like ?
        ) or exists (
          select 1 from recruiter_affiliations ra join organizations o
          on o.owner_id = ra.owner_id and o.id = ra.organization_id
          where ra.owner_id = r.owner_id and ra.recruiter_id = r.id and lower(o.display_name) like ?
        ))`);
        parameters.push(search, search, search);
      }
      if (filters.status) {
        clauses.push(
          "exists (select 1 from recruiter_relationship_statuses rs where rs.owner_id = r.owner_id and rs.recruiter_id = r.id and rs.status = ?)",
        );
        parameters.push(filters.status);
      }
      if (filters.unresolved)
        clauses.push(
          "exists (select 1 from evidence_assertions ea where ea.owner_id = r.owner_id and ea.recruiter_id = r.id and ea.review_requirement = 'user_review' and not exists (select 1 from review_decisions rd where rd.owner_id = ea.owner_id and rd.assertion_id = ea.id))",
        );
      if (filters.possibleCompanyChange)
        clauses.push(
          "(select count(distinct ra.organization_id) from recruiter_affiliations ra where ra.owner_id = r.owner_id and ra.recruiter_id = r.id) > 1",
        );
      const exclusion = `(exists (select 1 from recruiter_relationship_statuses rs where rs.owner_id = r.owner_id and rs.recruiter_id = r.id and rs.excluded_at is not null)
        or exists (select 1 from recruiter_identities ri join identity_exclusions ie on ie.owner_id = ri.owner_id and (ie.identity_id = ri.id or ie.domain = lower(substr(ri.normalized_email, instr(ri.normalized_email, '@') + 1))) where ri.owner_id = r.owner_id and ri.recruiter_id = r.id))`;
      clauses.push(filters.excluded ? exclusion : `not ${exclusion}`);
      const descending = filters.direction === "previous";
      if (cursor) {
        clauses.push(
          descending
            ? "(r.canonical_name < ? or (r.canonical_name = ? and r.id < ?))"
            : "(r.canonical_name > ? or (r.canonical_name = ? and r.id > ?))",
        );
        parameters.push(cursor.value, cursor.value, cursor.id);
      }
      const rows = all<RecruiterRow>(
        database,
        `select r.id, r.owner_id, r.canonical_name from recruiters r where ${clauses.join(" and ")}
         order by r.canonical_name ${descending ? "desc" : "asc"}, r.id ${descending ? "desc" : "asc"} limit ?`,
        ...parameters,
        limit + 1,
      );
      const hasMore = rows.length > limit;
      const visible = rows.slice(0, limit);
      if (descending) visible.reverse();
      const items = visible.map((recruiter) => buildSummary(database, ownerId, recruiter));
      return {
        items,
        previousCursor:
          cursor && items.length
            ? encodeCursor({ value: items[0].canonicalName, id: items[0].id })
            : null,
        nextCursor:
          hasMore && items.length
            ? encodeCursor({ value: items.at(-1)?.canonicalName ?? "", id: items.at(-1)?.id ?? "" })
            : null,
      };
    },

    getRecruiter(ownerId, recruiterId, cursor, direction = "next") {
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
      const timelineCursor = decodeCursor(cursor);
      const descending = direction === "previous";
      const candidateRows = timelineRows.filter(
        (event) =>
          !timelineCursor ||
          (descending
            ? event.occurred_at < timelineCursor.value ||
              (event.occurred_at === timelineCursor.value && event.id < timelineCursor.id)
            : event.occurred_at > timelineCursor.value ||
              (event.occurred_at === timelineCursor.value && event.id > timelineCursor.id)),
      );
      if (descending) candidateRows.reverse();
      const timelinePageRows = candidateRows.slice(0, 26);
      const visibleTimelineRows = timelinePageRows.slice(0, 25);
      if (descending) visibleTimelineRows.reverse();
      const timeline: TimelineEvent[] = visibleTimelineRows.map((event) => {
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
      const opportunities = opportunityRows.map((row) => toOpportunity(database, row));
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
        timelinePage: {
          items: timeline,
          previousCursor:
            (timelineCursor || (descending && timelinePageRows.length > 25)) && timeline.length
              ? encodeCursor({ value: timeline[0].occurredAt, id: timeline[0].id })
              : null,
          nextCursor:
            ((descending && timelineCursor) || (!descending && timelinePageRows.length > 25)) &&
            timeline.length
              ? encodeCursor({
                  value: timeline.at(-1)?.occurredAt ?? "",
                  id: timeline.at(-1)?.id ?? "",
                })
              : null,
        },
        opportunities,
        metrics: timelineRows.length
          ? deriveRecruiterMetrics(
              timelineRows.map((event) => ({
                occurredAt: event.occurred_at,
                direction: event.direction,
                conversationId: event.conversation_id,
              })),
              metricOpportunities,
            )
          : {
              firstContact: "Unknown",
              lastContact: "Unknown",
              recruiterMessages: 0,
              candidateReplies: 0,
              inferredFollowUps: 0,
              currentUnansweredSide: "none",
              unansweredDurationMilliseconds: 0,
              lastResponseLatencyMilliseconds: null,
              candidateMedianResponseLatencyMilliseconds: null,
              recruiterMedianResponseLatencyMilliseconds: null,
              opportunities: metricOpportunities.length,
              explicitSubmissions: metricOpportunities.filter(({ submitted }) => submitted).length,
              unknownOutcomes: metricOpportunities.filter(({ outcomeKnown }) => !outcomeKnown)
                .length,
            },
      } satisfies RecruiterDetail;
    },

    listOpportunities(ownerId) {
      return this.queryOpportunities(ownerId, { limit: 100 }).items;
    },

    queryOpportunities(ownerId, filters: OpportunityFilters = {}) {
      const cursor = decodeCursor(filters.cursor);
      const limit = pageLimit(filters.limit);
      const descending = filters.direction === "previous";
      const rows = all<Record<string, unknown>>(
        database,
        `select p.*, staffing.display_name as staffing_name, client.display_name as client_name,
                case when s.id is null then 0 else 1 end as submitted
         from opportunities p
         join recruiters r on r.id = p.recruiter_id and r.owner_id = p.owner_id
         join organizations staffing on staffing.id = p.staffing_organization_id and staffing.owner_id = p.owner_id
         left join organizations client on client.id = p.end_client_organization_id and client.owner_id = p.owner_id
         left join submissions s on s.opportunity_id = p.id and s.owner_id = p.owner_id
         where p.owner_id = ?
           and not exists (select 1 from recruiter_relationship_statuses rs where rs.owner_id = p.owner_id and rs.recruiter_id = p.recruiter_id and rs.excluded_at is not null)
           and not exists (
             select 1 from recruiter_identities ri join identity_exclusions ie
               on ie.owner_id = ri.owner_id
              and (ie.identity_id = ri.id or ie.domain = lower(substr(ri.normalized_email, instr(ri.normalized_email, '@') + 1)))
             where ri.owner_id = p.owner_id and ri.recruiter_id = p.recruiter_id
           )
           and (? is null or p.outcome_state = ?)
           and (? is null or (${opportunityStageSql}) = ?)
           and (? is null or ${descending ? "p.introduced_at < ? or (p.introduced_at = ? and p.id < ?)" : "p.introduced_at > ? or (p.introduced_at = ? and p.id > ?)"})
         order by p.introduced_at ${descending ? "desc" : "asc"}, p.id ${descending ? "desc" : "asc"} limit ?`,
        ownerId,
        filters.outcome ?? null,
        filters.outcome ?? null,
        filters.stage ?? null,
        filters.stage ?? null,
        cursor?.value ?? null,
        cursor?.value ?? null,
        cursor?.value ?? null,
        cursor?.id ?? null,
        limit + 1,
      );
      const visibleRows = rows.slice(0, limit);
      if (descending) visibleRows.reverse();
      const mapped = visibleRows.map((row) => {
        const evidenceRows = all<
          OpportunityStageEvidence & {
            evidence_id: string;
            occurred_at: string;
            fact_type: string;
            source_key: string;
            confidence_basis_points: number;
            inferred_number: number;
            decision: string | null;
            review_requirement: string;
          }
        >(
          database,
          `select ea.id as evidence_id, ea.occurred_at, ea.fact_type, sr.source_key,
                  ea.confidence_basis_points, ea.inferred as inferred_number, ea.review_requirement, rd.decision
           from evidence_assertions ea join source_references sr on sr.id = ea.source_reference_id and sr.owner_id = ea.owner_id
           left join review_decisions rd on rd.id = (select x.id from review_decisions x where x.owner_id = ea.owner_id and x.assertion_id = ea.id order by x.revision desc limit 1)
           where ea.owner_id = ? and ea.opportunity_id = ?`,
          ownerId,
          String(row.id),
        ).map((item) => ({
          evidenceId: item.evidence_id,
          occurredAt: item.occurred_at,
          factType: item.fact_type,
          sourceKey: item.source_key,
          confidenceBasisPoints: item.confidence_basis_points,
          inferred: Boolean(item.inferred_number),
          reviewState:
            item.decision ?? (item.review_requirement === "none" ? "accepted" : "proposed"),
        })) as OpportunityStageEvidence[];
        const manualOutcome = latestManualAssertion(
          database,
          ownerId,
          "opportunity",
          String(row.id),
          "outcome_state",
        );
        const manualTitle = latestManualAssertion(
          database,
          ownerId,
          "opportunity",
          String(row.id),
          "title",
        );
        const outcome = String(manualOutcome?.value ?? row.outcome_state) as OpportunityOutcome;
        return {
          ...toOpportunity(database, row),
          outcome,
          staffingOrganization: String(row.staffing_name),
          endClientOrganization: row.client_name ? String(row.client_name) : null,
          submitted: Boolean(row.submitted),
          stage: deriveOpportunityStage(evidenceRows, outcome),
          excluded: false,
          provenance: {
            title: manualTitle ? "manual" : "machine",
            outcome: manualOutcome ? "manual" : "machine",
          },
          fallbackValues: {
            title: manualTitle ? row.title : null,
            outcome: manualOutcome ? row.outcome_state : null,
          },
        } satisfies OpportunitySummary;
      });
      const hasMore = rows.length > limit;
      const items = mapped;
      return {
        items,
        previousCursor:
          (cursor || (descending && hasMore)) && items.length
            ? encodeCursor({ value: items[0].introducedAt, id: items[0].id })
            : null,
        nextCursor:
          ((descending && cursor) || (!descending && hasMore)) && items.length
            ? encodeCursor({ value: items.at(-1)?.introducedAt ?? "", id: items.at(-1)?.id ?? "" })
            : null,
      };
    },

    getOpportunity(ownerId, opportunityId) {
      const row = one<Record<string, unknown>>(
        database,
        `select p.*, staffing.display_name as staffing_name, client.display_name as client_name,
                case when s.id is null then 0 else 1 end as submitted
         from opportunities p
         join recruiters r on r.id = p.recruiter_id and r.owner_id = p.owner_id
         join organizations staffing on staffing.id = p.staffing_organization_id and staffing.owner_id = p.owner_id
         left join organizations client on client.id = p.end_client_organization_id and client.owner_id = p.owner_id
         left join submissions s on s.opportunity_id = p.id and s.owner_id = p.owner_id
         where p.owner_id = ? and p.id = ?
           and not exists (select 1 from recruiter_relationship_statuses rs where rs.owner_id = p.owner_id and rs.recruiter_id = p.recruiter_id and rs.excluded_at is not null)
           and not exists (
             select 1 from recruiter_identities ri join identity_exclusions ie
               on ie.owner_id = ri.owner_id
              and (ie.identity_id = ri.id or ie.domain = lower(substr(ri.normalized_email, instr(ri.normalized_email, '@') + 1)))
             where ri.owner_id = p.owner_id and ri.recruiter_id = p.recruiter_id
           )`,
        ownerId,
        opportunityId,
      );
      if (!row) return null;
      const evidence = all<{
        evidence_id: string;
        occurred_at: string;
        fact_type: string;
        source_key: string;
        confidence_basis_points: number;
        inferred_number: number;
        decision: string | null;
        review_requirement: string;
      }>(
        database,
        `select ea.id as evidence_id, ea.occurred_at, ea.fact_type, sr.source_key,
                ea.confidence_basis_points, ea.inferred as inferred_number, ea.review_requirement, rd.decision
         from evidence_assertions ea join source_references sr on sr.id = ea.source_reference_id and sr.owner_id = ea.owner_id
         left join review_decisions rd on rd.id = (select x.id from review_decisions x where x.owner_id = ea.owner_id and x.assertion_id = ea.id order by x.revision desc limit 1)
         where ea.owner_id = ? and ea.opportunity_id = ? order by ea.occurred_at, ea.id`,
        ownerId,
        opportunityId,
      ).map((item) => ({
        evidenceId: item.evidence_id,
        occurredAt: item.occurred_at,
        factType: item.fact_type,
        sourceKey: item.source_key,
        confidenceBasisPoints: item.confidence_basis_points,
        inferred: Boolean(item.inferred_number),
        reviewState: (item.decision ??
          (item.review_requirement === "none"
            ? "accepted"
            : "proposed")) as OpportunityStageEvidence["reviewState"],
      }));
      const manualOutcome = latestManualAssertion(
        database,
        ownerId,
        "opportunity",
        opportunityId,
        "outcome_state",
      );
      const manualTitle = latestManualAssertion(
        database,
        ownerId,
        "opportunity",
        opportunityId,
        "title",
      );
      const outcome = String(manualOutcome?.value ?? row.outcome_state) as OpportunityOutcome;
      const summary: OpportunitySummary = {
        ...toOpportunity(database, row),
        outcome,
        staffingOrganization: String(row.staffing_name),
        endClientOrganization: row.client_name ? String(row.client_name) : null,
        submitted: Boolean(row.submitted),
        stage: deriveOpportunityStage(evidence, outcome),
        excluded: false,
        provenance: {
          title: manualTitle ? "manual" : "machine",
          outcome: manualOutcome ? "manual" : "machine",
        },
        fallbackValues: {
          title: manualTitle ? row.title : null,
          outcome: manualOutcome ? row.outcome_state : null,
        },
      };
      return { ...summary, stageHistory: deriveOpportunityStageHistory(evidence, outcome) };
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

    setRelationshipStatus(ownerId, recruiterId, status, now) {
      const recruiter = one(
        database,
        "select 1 from recruiters where owner_id = ? and id = ?",
        ownerId,
        recruiterId,
      );
      if (!recruiter) throw new Error("Recruiter not found");
      database.sqlite
        .prepare(
          `insert into recruiter_relationship_statuses (id, owner_id, recruiter_id, status, excluded_at, updated_at)
         values (?, ?, ?, ?, null, ?)
         on conflict(recruiter_id) do update set status = excluded.status, updated_at = excluded.updated_at
         where recruiter_relationship_statuses.owner_id = excluded.owner_id`,
        )
        .run(randomUUID(), ownerId, recruiterId, status, now);
    },

    excludeRecruiter(ownerId, recruiterId, now) {
      const recruiter = one(
        database,
        "select 1 from recruiters where owner_id = ? and id = ?",
        ownerId,
        recruiterId,
      );
      if (!recruiter) throw new Error("Recruiter not found");
      database.sqlite
        .prepare(
          `insert into recruiter_relationship_statuses (id, owner_id, recruiter_id, status, excluded_at, updated_at)
         values (?, ?, ?, null, ?, ?)
         on conflict(recruiter_id) do update set excluded_at = coalesce(recruiter_relationship_statuses.excluded_at, excluded.excluded_at), updated_at = excluded.updated_at
         where recruiter_relationship_statuses.owner_id = excluded.owner_id`,
        )
        .run(randomUUID(), ownerId, recruiterId, now, now);
    },

    restoreRecruiter(ownerId, recruiterId, now) {
      const result = database.sqlite
        .prepare(
          "update recruiter_relationship_statuses set excluded_at = null, updated_at = ? where owner_id = ? and recruiter_id = ?",
        )
        .run(now, ownerId, recruiterId);
      if (
        result.changes === 0 &&
        !one(
          database,
          "select 1 from recruiters where owner_id = ? and id = ?",
          ownerId,
          recruiterId,
        )
      )
        throw new Error("Recruiter not found");
    },

    excludeIdentity(ownerId, identityId, reason, now) {
      const identity = one(
        database,
        "select 1 from recruiter_identities where owner_id = ? and id = ?",
        ownerId,
        identityId,
      );
      if (!identity) throw new Error("Identity not found");
      database.sqlite
        .prepare(
          `insert into identity_exclusions (id, owner_id, identity_id, domain, reason, excluded_at)
         values (?, ?, ?, null, ?, ?) on conflict(owner_id, identity_id) where identity_id is not null do nothing`,
        )
        .run(randomUUID(), ownerId, identityId, reason, now);
    },

    excludeDomain(ownerId, domain, reason, now) {
      database.sqlite
        .prepare(
          `insert into identity_exclusions (id, owner_id, identity_id, domain, reason, excluded_at)
         values (?, ?, null, ?, ?, ?) on conflict(owner_id, domain) where domain is not null do nothing`,
        )
        .run(randomUUID(), ownerId, domain, reason, now);
    },

    restoreIdentityExclusion(ownerId, exclusionId) {
      database.sqlite
        .prepare("delete from identity_exclusions where owner_id = ? and id = ?")
        .run(ownerId, exclusionId);
    },

    deleteRecruiterData(ownerId, recruiterId, now) {
      database.sqlite.exec("BEGIN IMMEDIATE");
      try {
        const recruiter = one<RecruiterRow>(
          database,
          "select id, owner_id, canonical_name from recruiters where owner_id = ? and id = ?",
          ownerId,
          recruiterId,
        );
        if (!recruiter) throw new Error("Recruiter not found");
        const activeImport = one(
          database,
          `select 1 from historical_imports where owner_id = ? and status in ('uploading', 'processing') limit 1`,
          ownerId,
        );
        if (activeImport) throw new Error("Pause the active import before deleting recruiter data");
        database.sqlite
          .prepare(
            `delete from review_decisions where owner_id = ? and assertion_id in (
             select id from evidence_assertions where owner_id = ? and (recruiter_id = ? or opportunity_id in (select id from opportunities where owner_id = ? and recruiter_id = ?) or affiliation_id in (select id from recruiter_affiliations where owner_id = ? and recruiter_id = ?))
           )`,
          )
          .run(ownerId, ownerId, recruiterId, ownerId, recruiterId, ownerId, recruiterId);
        database.sqlite
          .prepare(
            `delete from evidence_assertions where owner_id = ? and (recruiter_id = ? or opportunity_id in (select id from opportunities where owner_id = ? and recruiter_id = ?) or affiliation_id in (select id from recruiter_affiliations where owner_id = ? and recruiter_id = ?))`,
          )
          .run(ownerId, recruiterId, ownerId, recruiterId, ownerId, recruiterId);
        database.sqlite
          .prepare("delete from submissions where owner_id = ? and recruiter_id = ?")
          .run(ownerId, recruiterId);
        database.sqlite
          .prepare(
            "delete from conversation_opportunities where owner_id = ? and (conversation_id in (select id from conversations where owner_id = ? and recruiter_id = ?) or opportunity_id in (select id from opportunities where owner_id = ? and recruiter_id = ?))",
          )
          .run(ownerId, ownerId, recruiterId, ownerId, recruiterId);
        database.sqlite
          .prepare(
            "delete from communication_events where owner_id = ? and conversation_id in (select id from conversations where owner_id = ? and recruiter_id = ?)",
          )
          .run(ownerId, ownerId, recruiterId);
        database.sqlite
          .prepare("delete from conversations where owner_id = ? and recruiter_id = ?")
          .run(ownerId, recruiterId);
        database.sqlite
          .prepare("delete from opportunities where owner_id = ? and recruiter_id = ?")
          .run(ownerId, recruiterId);
        database.sqlite
          .prepare("delete from recruiter_affiliations where owner_id = ? and recruiter_id = ?")
          .run(ownerId, recruiterId);
        database.sqlite
          .prepare(
            "delete from identity_exclusions where owner_id = ? and identity_id in (select id from recruiter_identities where owner_id = ? and recruiter_id = ?)",
          )
          .run(ownerId, ownerId, recruiterId);
        database.sqlite
          .prepare("delete from recruiter_identities where owner_id = ? and recruiter_id = ?")
          .run(ownerId, recruiterId);
        database.sqlite
          .prepare(
            "delete from recruiter_relationship_statuses where owner_id = ? and recruiter_id = ?",
          )
          .run(ownerId, recruiterId);
        database.sqlite
          .prepare("delete from recruiters where owner_id = ? and id = ?")
          .run(ownerId, recruiterId);
        database.sqlite
          .prepare(
            `insert into recruiter_deletions (id, owner_id, recruiter_id, canonical_name_hash, scope, deleted_at)
           values (?, ?, ?, ?, 'recruiter_derived_data', ?)`,
          )
          .run(
            randomUUID(),
            ownerId,
            recruiterId,
            createHash("sha256")
              .update(recruiter.canonical_name.trim().toLocaleLowerCase("en-US"))
              .digest("hex"),
            now,
          );
        const violations = all(database, "pragma foreign_key_check");
        if (violations.length) throw new Error("Deletion integrity check failed");
        database.sqlite.exec("COMMIT");
      } catch (error) {
        if (database.sqlite.inTransaction) database.sqlite.exec("ROLLBACK");
        throw error;
      }
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
      const relationshipStatuses = scoped("recruiter_relationship_statuses") as Record<
        string,
        unknown
      >[];
      const identityExclusions = scoped("identity_exclusions") as Record<string, unknown>[];
      const excludedRecruiters = new Set(
        relationshipStatuses
          .filter((row) => row.excluded_at)
          .map((row) => String(row.recruiter_id)),
      );
      const excludedIdentityIds = new Set(
        identityExclusions.filter((row) => row.identity_id).map((row) => String(row.identity_id)),
      );
      const excludedDomains = new Set(
        identityExclusions.filter((row) => row.domain).map((row) => String(row.domain)),
      );
      const exportedIdentities = (scoped("recruiter_identities") as Record<string, unknown>[]).map(
        (row) => ({
          ...row,
          excluded:
            excludedIdentityIds.has(String(row.id)) ||
            excludedDomains.has(String(row.normalized_email).split("@").at(-1) ?? ""),
        }),
      );
      for (const identity of exportedIdentities)
        if (identity.excluded)
          excludedRecruiters.add(String((identity as Record<string, unknown>).recruiter_id));
      return {
        exportedAt,
        formatVersion: 3,
        owner: { id: owner.id, displayName: owner.display_name },
        recruiters: (scoped("recruiters") as Record<string, unknown>[]).map((row) => ({
          ...row,
          excluded: excludedRecruiters.has(String(row.id)),
        })),
        recruiterIdentities: exportedIdentities,
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
        relationshipStatuses,
        identityExclusions,
        recruiterDeletions: scoped("recruiter_deletions"),
        importSourceRecords: scoped("import_source_records"),
        manualAssertions: scoped("manual_assertions").map((value) => {
          const row = value as Record<string, unknown>;
          return {
            ...row,
            value: JSON.parse(String(row.value_json)),
            value_json: undefined,
            provenance: "user_manual",
            effective: row.retracted_at === null,
          };
        }),
      } satisfies PortableExport;
    },
  };
}
