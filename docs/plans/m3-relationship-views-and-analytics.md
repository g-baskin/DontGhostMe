# M3 relationship views and analytics plan

**Status:** Draft for approval — not implemented
**Date:** 2026-09-03

## Objective

Make the imported and reviewed history useful as a local product without any persistent mailbox connection. Deliver the recruiter directory, unified timelines, an opportunity pipeline with evidence-backed stage history, relationship-status filters, and exclusion workflows, all correctable and all safe to reprocess.

"Analytics" in M3 means locally derived communication metrics shown in the interface. It does not mean telemetry, tracking, or any network reporting.

## Product decisions

1. **Relationship status is a user-owned field with derived suggestions, never silent automation.** The user sets `active`, `dormant`, or `do-not-contact` explicitly. The system may surface a suggestion ("no contact in 180 days — mark dormant?") but never changes the status itself.
2. **`excluded` is a separate hard state**, not a fourth relationship status. Excluding a recruiter hides them from directory, timelines, metrics, and export-by-default, while preserving all source data and the exclusion itself so it survives re-import and reprocessing. Exclusion is reversible.
3. **Opportunity stages are derived, not stored.** Stage history is computed at read time from promoted extracted events (M2 outcomes) plus their source references. Only the current relationship status and user decisions are persisted. This keeps reprocessing semantics identical to M2: promotion changes facts, derivation just re-derives.
4. **`outcomeState` widens beyond `unknown` only through promoted, evidence-backed events** or explicit user decision, replacing the M0 placeholder check constraint. A resume request never advances the stage; submission requires explicit language or user confirmation, per existing interpretation rules.
5. **Latency metrics are defined in the interface.** Every metric shown carries a definition string (e.g., last response latency = time between the last inbound recruiter message and the last candidate reply, or vice versa for the unanswered direction). Median latency is hidden until at least three qualifying pairs exist.
6. **Pagination is cursor-based on stable sort keys** (timestamp + id) for directory, timeline, and pipeline lists. No unbounded queries; empty, loading, error, and large-data states are part of each surface's accessibility contract.

## Scope

### Included

- Recruiter directory with search, relationship-status filter, uncertain-match filter, and possible-company-change filter.
- Recruiter detail: unified timeline with source-linked events, identity/affiliation history, extended metrics, status controls, exclude/restore.
- Opportunity pipeline: list with stage summaries, detail view with evidence-backed stage history and last-known outcome.
- Extended metrics: last response latency, median response latency by direction (gated at ≥3 pairs), current unanswered side, unanswered duration.
- Home dashboard sections per `docs/PRODUCT_BRIEF.md`: relationships needing review, opportunities awaiting update, recent activity, possible company changes, unresolved/stale submissions.
- Exclusion workflow for recruiters and identity addresses; excluded senders/domains surfaced in Data & Privacy.
- Deletion workflow extension: delete all data for one recruiter (with confirmation and provenance-preserving audit note), complementing existing import deletion.
- Accessible empty/loading/error/large-data states on every new or changed surface.

### Excluded

- Live Gmail, LinkedIn, AI/LLM classification, email verification, telemetry, outbound messaging, or any network integration (unchanged prohibitions).
- Automatic status changes, automatic exclusions, or bulk actions beyond "exclude sender domain".
- PostgreSQL, multi-user, authentication changes.
- Notes/free-text fields on recruiters or opportunities (defer; not required by M3 exit criteria).

## Existing architecture to preserve

- Repository boundary: domain reads via `ReadRepository`, no Drizzle types in domain or application layers.
- Append-only review/decision records with preserved provenance; corrections survive reprocessing (M2 invariant).
- Forward-only checked-in migrations; expand-migrate-contract sequencing; never edit applied migrations.
- Existing six routes, import workspace, and classification workspace remain functional and tested.
- Node-compatible application code; Bun only as package manager/runner.

## Data model and migration

Additive migration `0004_m3_relationship_status`:

1. `recruiter_relationship_status` table: `recruiterId`, `ownerId`, `status` (`active|dormant|do_not_contact|null`), `excludedAt` timestamp nullable, `updatedAt`, `setBy` (`user`), with FK cascade tied to recruiter deletion. One row per recruiter, upserted on change. Absence of a row means unset (not "active").
2. `identity_exclusions` table: `ownerId`, `identityId` or `domain` (exactly one non-null), `excludedAt`, `reason` optional. Enforced by CHECK and unique index.
3. Widen `opportunities_outcome_check` from `= 'unknown'` to the M2 canonical outcome vocabulary in a table-rebuild migration (SQLite constraint changes require rebuild; follow the M1/M2 rebuild pattern with integrity verification in the migration test).
4. `recruiter_deletions` audit table: `ownerId`, `recruiterId`, `deletedAt`, `scope` — persists after cascading delete so deletion is auditable without retaining personal facts.

No changes to source-message, normalized-message, classification, or decision tables.

## Derivation contracts

- **Stage history:** ordered promotion of M2 canonical outcomes per opportunity → `(stage, timestamp, evidenceAssertionId, sourceReferenceId, confidence)` rows; `unknown` remains a valid terminal stage.
- **Possible company change:** classification proposals of type company-change not yet decided, or affiliations with overlapping date ranges — surfaced as a filter and Home card, never auto-merged.
- **Metrics:** extend `src/domain/metrics.ts`; all new derivations unit-tested against the Jane corpus plus new fixtures covering latency edges (no replies, one reply, candidate-initiated threads).
- **Filters:** directory filtering happens in SQL with the pagination cursor, not in memory.

## Application and UI

- New application services: `set-relationship-status`, `exclude-recruiter`, `restore-recruiter`, `exclude-identity-domain`, `delete-recruiter-data`, `get-opportunity-detail`.
- Routes unchanged (six existing surfaces absorb the work); add `opportunities/[opportunityId]` detail route.
- Status controls, exclude/restore, and delete use progressive-enhancement forms with confirmation for destructive actions, matching the existing review-decision form pattern.
- Every list surface gets cursor pagination (default page 50) and defined empty/loading/error states.

## Privacy, safety, and compliance guardrails

- Exclusion and deletion never touch source mail archives; they operate only on derived local data.
- Delete-recruiter keeps the audit row, drops derived facts via FK cascade, and cannot run while an import is active for that owner.
- No new external dependencies, no telemetry, no logs of message content (existing redaction rules apply to new error paths).
- Export gains excluded-data opt-in section; default export excludes nothing that exists but marks excluded records with their status so the user's export stays complete and honest.

## Evaluation and tests

- Unit: status transitions and guards, exclusion/restore semantics, stage derivation ordering, latency metrics, pagination cursors, outcome-check migration rebuild integrity.
- Application: new services with synthetic fixtures only.
- Component: status controls, exclude/restore, pipeline list states.
- E2E (Chromium, extends `jane-timeline.spec.ts` pattern): set dormant → filter → verify persistence after reprocess; exclude recruiter → absent from directory/export-default → restore; opportunity stage history shows evidence-backed progression ending in the Jane unknown outcome; pagination over a generated large synthetic corpus (≥300 recruiters).
- Migration test: M2-populated database upgraded to M3 schema with `foreign_key_check` clean and all M2 counts unchanged.

## Risks and mitigations

- **Constraint rebuild migration on populated data** — highest-risk step; mitigated by following the established M1/M2 rebuild pattern with a dedicated migration test and backup gate (`bun run db:backup` before applying).
- **Derived-stage drift if M2 outcomes change** — acceptable by design (re-derivation is cheap and correct); test asserts equality after a no-op reprocess.
- **Filter/pagination interaction bugs** — cover filter+cursor combinations in unit tests explicitly.
- **Scope creep toward M4/M5** — this plan adds zero network surface; anything requiring one is out of scope by construction.

## Verification

- `bun run check`, `typecheck`, `test`, `test:export`, `build`, `test:e2e`, `db:backup`, `db:verify` all pass.
- M3 exit criteria demonstrable on synthetic data: directory with filters, unified Jane timeline, separated opportunities with stage history, correction/reprocess survival, exclusion and deletion flows working.
- Security review then quality review before closeout, per project convention.

## Steps

1. Migration 0004 (tables + outcome-check rebuild) with migration test on an M2-populated database.
2. Domain + repository layer: status, exclusion, stage derivation, extended metrics, cursored queries.
3. Application services and API routes for status/exclusion/deletion/opportunity detail.
4. UI: directory filters, detail status controls, pipeline + opportunity detail, Home dashboard sections, pagination and state contracts.
5. Export extension and Data & Privacy excluded-senders surface.
6. Tests per the evaluation section; E2E flows; accessibility checks on new states.
7. Security review, quality review, closeout report; update ROADMAP/CLAUDE.md status only after approval of results.

Each step lands with its tests green before the next begins.
