# M2 recruiter and opportunity discovery plan

## Objective

Turn M1 `normalized_messages` into deterministic, explainable, correctable proposals for recruiter identities, organizations, opportunities, conversations, communication events, affiliations, and submission claims. Keep proposals separate from accepted product facts until policy or user review permits promotion.

This plan treats the user's soft approval as M1 closeout. The uncommitted M1 working tree is the implementation baseline; M2 must not rewrite or weaken its import boundaries.

## Product decisions

- Require the candidate to enter and confirm their own mailbox address and aliases before classification. MBOX headers do not reliably identify the mailbox owner, so direction must not be guessed.
- Use a deterministic, local rules engine only. No external model, network request, probabilistic dependency, or hidden training data.
- Store classifier output as proposals, not provisional rows in canonical recruiter/opportunity tables.
- Promote accepted proposals transactionally into the existing M0 canonical tables and preserve every source link, confidence score, and decision revision.
- Never auto-merge people by name, display name, organization, or email domain. Exact normalized email identifies an address, not necessarily the same human across addresses.
- Require user confirmation for every identity merge/split, company-change inference, opportunity grouping ambiguity, and submission claim.
- Derive message direction only when exactly one side contains a confirmed owner address; otherwise preserve `unknown` and request review.
- Keep opportunity outcome explicitly `unknown`; silence, elapsed time, or missing replies never imply rejection or ghosting.
- Do not add a dependency. The existing runtime and standard library are sufficient for bounded tokenization, phrase matching, hashing, and normalization.

## Scope

### Included

- Candidate-owned email-alias setup and correction.
- Versioned deterministic classification runs over imported normalized messages.
- Recruiter/non-recruiter detection with positive and negative signal codes.
- Exact-address identity proposals and review-only cross-address identity links.
- Organization/affiliation, opportunity, conversation, direction/event, and explicit-submission proposals.
- Explainable evidence excerpts, confidence contributions, and source provenance.
- Accept, reject, correct, merge, split, and reprocess workflows.
- Synthetic labeled evaluation corpus and measurable precision/recall safeguards.
- Export, backup, deletion, migration, accessibility, security, and documentation updates.

### Excluded

- Live Gmail OAuth or synchronization.
- Gmail mutation scopes or actions.
- LinkedIn scraping, cookies, hidden APIs, or browser automation.
- External AI/LLM calls, embeddings, analytics, telemetry, verification, enrichment, or outbound messaging.
- Automatic rejection/ghosting conclusions.
- PostgreSQL or multi-user hosting work.
- M3 directory, pipeline, and analytics expansion beyond the review surfaces needed for M2.

## Existing architecture to preserve

- `src/db/schema.ts` already separates M1 source metadata and normalized text from M0 canonical entities, assertions, and review decisions.
- `src/db/historical-imports.ts::persistParsedFrames` commits normalized messages with source provenance while avoiding premature product assertions.
- `src/db/write.ts::withImmediateTransaction` is the single-writer, bounded-busy-retry primitive for all proposal and promotion writes.
- `src/application/local-request.ts` is the mandatory guard for mutation routes.
- `src/application/get-review-queue.ts` and `src/components/review-decision-form.tsx` establish append-only correction behavior that M2 should generalize rather than bypass.
- `src/db/owner-data.ts`, export repositories, backup scripts, and additive Drizzle migrations must remain synchronized.

## Real-code reference

The corpus search found Paperless-ngx's versioned classification suggestion cache at `paperless-ngx/paperless-ngx/src/documents/caching.py` (commit `c5765a50`). Its `SuggestionCacheData` records a classifier version and hash, and stale suggestions are rejected when either differs. M2 will adapt that proven invalidation pattern to persisted local proposals: every run records an engine version and ruleset hash, and reprocessing never silently reuses incompatible output.

The corpus did not contain a suitable recruiter-email rules engine, and repository discovery returned no additional classifier projects. The domain-specific signal rules below are therefore grounded in this product's synthetic fixtures and must be validated by the labeled evaluation suite before promotion behavior ships.

## Data model and migration

Create additive `drizzle/0002_recruiter_discovery.sql` and synchronized schema/snapshot metadata. Never edit `0000_m0.sql` or `0001_safe_historical_import.sql`.

### `owner_email_identities`

- `id`, `owner_id`, `normalized_email`, `display_email`, `confirmed_at`, `created_at`, `updated_at`.
- Unique `(owner_id, normalized_email)`; normalize with the existing IDNA/address boundary rules.
- Owner-scoped deletion and export support.

### `classification_runs`

- `id`, `owner_id`, `engine_version`, `ruleset_sha256`, `source_set_sha256`, `status`, counters, checkpoint message ID, timestamps, and allowlisted error code.
- Statuses: `running`, `completed`, `failed`, `superseded`.
- Unique idempotency key across owner, engine version, ruleset hash, and source-set hash.

### `classification_proposals`

- `id`, `owner_id`, `run_id`, `proposal_key`, `proposal_type`, `proposed_value_json`, `confidence_basis_points`, `review_requirement`, `state`, `supersedes_proposal_id`, `promoted_entity_kind`, `promoted_entity_id`, and timestamps.
- Proposal types: `message_direction`, `recruiter_identity`, `identity_link`, `organization_affiliation`, `opportunity`, `conversation_group`, and `submission`.
- States: `proposed`, `accepted`, `rejected`, `corrected`, `superseded`.
- Validate polymorphic JSON at the domain boundary; cap its serialized byte length in code and SQL.
- Stable `proposal_key` is a hash of normalized inputs and proposal type, not a generated ID.

### `classification_evidence`

- `id`, `owner_id`, `proposal_id`, `normalized_message_id`, `signal_code`, `contribution_basis_points`, bounded `excerpt`, `excerpt_start`, `excerpt_end`, and `created_at`.
- Unique evidence tuple prevents duplicate evidence on resume/reprocessing.
- Excerpts come only from M1 inert `safe_text`; never retain raw HTML or attachments.

### `classification_decisions`

- `id`, `owner_id`, `proposal_id`, append-only `revision`, `decision`, optional bounded `corrected_value_json`, and `created_at`.
- Decisions: `accepted`, `rejected`, `corrected`, `merge`, `split`.
- Unique owner/proposal/revision and decision/value consistency checks.
- A new classifier version may supersede undecided proposals but cannot overwrite or invalidate a user's prior decision.

### Canonical outcome state

- Add `opportunities.outcome_state` with default/check value `unknown`.
- M2 does not infer another outcome value. Future transitions require explicit evidence or user action.

## Classification contract

Implement pure functions under `src/classification/` before persistence orchestration.

### Input

A bounded projection of each `normalized_messages` row: ID, sent time, subject, sender, recipients, reply-to, Message-ID/references, inert safe text, truncation flag, and warning codes. Address lists and text are already bounded by M1.

### Signals

- Owner direction: exact match against confirmed `owner_email_identities`; ambiguous/missing ownership yields `unknown`.
- Recruiter positives: external human sender, recruiter/staffing title phrases, direct role language, interview coordination, right-to-represent language, explicit client/role introduction, or explicit submission wording.
- Recruiter negatives: candidate-only traffic, no-reply/system senders, job alerts, newsletters, receipts, calendar-only notices, marketing unsubscribe language, and ATS acknowledgements lacking a human recruiter signal.
- Identity: exact normalized address is strong address identity evidence. Cross-address person links require explicit self-identification/continuity evidence or user confirmation; equal names contribute zero merge authority.
- Organization affiliation: signature/company evidence can create a review proposal, never an automatic company-change fact.
- Opportunity: require recruiter evidence plus role/client evidence. Group by strong thread references first; normalized subject and participant overlap may propose, but not silently confirm, a group.
- Submission: only explicit recruiter-authored claims that the candidate/profile was submitted or presented to a named client create proposals. Resume requests, consent/right-to-represent, applications, acknowledgements, and interview scheduling are not submissions.
- Unknowns: unsupported, contradictory, truncated, or warning-bearing evidence lowers confidence or forces review; absence never becomes negative outcome evidence.

### Explainability and confidence

- Define a frozen signal-code catalog and integer basis-point weights in `src/classification/rules.ts`.
- Clamp confidence to 0–10000 and retain every contribution as `classification_evidence`.
- Generate user-facing explanations from signal codes, never from hidden free-form reasoning.
- Treat confidence as ranking/review guidance, never truth.
- Version both the engine contract and a SHA-256 hash of canonicalized rule definitions.

## Processing and promotion

- Classify in deterministic message order using short batches and checkpoints; read text outside write transactions.
- Persist each batch's proposals, evidence, counters, and next checkpoint in one immediate transaction.
- Re-running the same source set/ruleset is idempotent.
- A changed ruleset creates a new run, links replacements with `supersedes_proposal_id`, and leaves decided history intact.
- Acceptance/correction promotes canonical records in one transaction and writes `source_references`, `evidence_assertions`, and `review_decisions` compatible with existing M0 views.
- Rejection records only the decision and never deletes evidence.
- Merge/split operations validate owner scope, prevent name-only merges, retain aliases and historical affiliations, and never rewrite source evidence.
- Promotion is retry-safe through stable proposal keys and existing canonical uniqueness constraints.

## Application and UI

- Add owner-address setup to `/review-queue` before the first classification run.
- Add local-only APIs for owner identities, starting/resuming a classification run, listing proposals, and recording decisions.
- Expand `src/app/review-queue/page.tsx` into grouped proposal sections with filters for type and state.
- Each card shows proposed value, confidence, plain-language signal basis, bounded source excerpt, provenance date/source, and correction controls.
- Merge/split and opportunity grouping require explicit confirmation dialogs; submission confirmation must say that consent/resume requests are not proof of submission.
- Provide loading, empty, processing, interrupted, error, and completed states; preserve keyboard order, focus, forced colors, reduced motion, text spacing, and 320px reflow.
- Canonical recruiter/opportunity pages continue showing accepted facts only.

## Privacy, safety, and compliance guardrails

- This is candidate-side personal organization, not employer-side ranking or automated hiring decision-making.
- Never send message content, addresses, excerpts, proposals, or decisions off-device.
- Never log safe text, subjects, addresses, excerpts, proposed values, or corrected values.
- Owner-scope every query and mutation; use exact-origin mutation checks and parameterized SQLite statements.
- Bound rule inputs, JSON payloads, evidence excerpts, batch work, and error messages.
- Export all new owner data and delete it in foreign-key-safe order.
- Preserve correction and deletion controls; classification cannot make imported data undeletable.
- Update `COMPLIANCE.md` only with observed engineering controls and residual risks, labelled `NOT LEGAL ADVICE`; do not claim legal compliance.

## Evaluation and tests

Create a small fictional `.example` labeled corpus covering:

- Human recruiter, agency recruiter, internal recruiter, and non-recruiter mail.
- Job alerts, newsletters, ATS acknowledgements, calendar notices, and receipts.
- Missing/invalid dates, truncated text, malformed addresses, multiple recipients, forwarded text, and conflicting signals.
- Same name/different people, one person changing company, aliases, shared inboxes, and unrelated same-domain senders.
- Separate opportunities in one thread, similar titles at different clients, and ambiguous grouping.
- Explicit submission, application receipt, resume request, right-to-represent, interview scheduling, withdrawal, rejection, silence, and unknown outcome.

Acceptance thresholds:

- Recruiter detection precision at least 95% and recall at least 80% on the frozen synthetic set.
- Zero false-positive identity merges.
- Zero false-positive confirmed submissions; all submission proposals require review.
- Zero non-`unknown` outcomes inferred from silence or elapsed time.
- Repeated and interrupted runs produce byte-stable proposal/evidence projections after volatile IDs/timestamps are removed.
- Reprocessing with a changed ruleset preserves all decisions and corrections.
- Candidate-owned export/deletion includes every M2 row without local paths or leaked content.
- Existing M0/M1 tests remain green.

## Risks and mitigations

- **Mailbox-owner ambiguity:** require confirmed owner aliases before direction classification.
- **False recruiter positives:** negative system-mail signals and precision gate; uncertain items remain proposals.
- **Identity collapse:** exact-address identity plus explicit review; names never authorize merge.
- **Submission overclaim:** no automatic promotion and adversarial negative fixtures.
- **Rule drift:** version/hash every run and supersede without overwriting decisions.
- **Flexible JSON corruption:** typed validators, byte caps, stable canonical serialization, and SQL checks.
- **Large mailbox cost:** bounded projections, indexed checkpoints, short batches, and one writer.
- **Sensitive text exposure:** inert excerpts only, no content logs, local processing, export/deletion tests.

## Verification

Run, in order:

1. Focused classification pure-function and evaluation tests.
2. Migration-from-populated-M1, foreign-key, idempotency, interruption, reprocessing, and decision-preservation tests.
3. API/component tests for owner identity, owner scoping, correction, merge/split, and redacted errors.
4. Focused Playwright review-queue flow with accessibility checks.
5. `git diff --check`.
6. `bun install --frozen-lockfile` using the pinned Bun 1.4.0 runtime.
7. `bun run check`.
8. `bun run typecheck`.
9. `bun run test`.
10. `bun run test:export`.
11. `bun run build`.
12. `bun run test:e2e`.
13. `bun run db:backup` and foreign-key verification.
14. Node 24 and Node 26 CI matrix, recorded as a soft follow-up if unavailable locally under the accepted M1 policy.

## Steps

1. Create `docs/plans/m2-recruiter-opportunity-discovery.md` from this approved plan and update roadmap status without changing M1 boundaries.
2. Add typed owner-identity, classification-run, proposal, evidence, decision, signal, and outcome contracts under `src/domain/` and `src/classification/`.
3. Add migration `drizzle/0002_recruiter_discovery.sql`, synchronized Drizzle schema/snapshot metadata, indexes, constraints, export tables, backup tables, and deletion order.
4. Implement pure deterministic address, direction, recruiter, identity-link, organization, opportunity, conversation, and submission proposal rules with versioned signal weights.
5. Add the fictional labeled evaluation corpus and pure-rule tests enforcing precision, recall, no-merge, no-submission, and unknown-outcome thresholds.
6. Implement owner-scoped repositories for confirmed aliases, classification runs, checkpointed proposal persistence, evidence, decisions, and version-preserving reprocessing.
7. Implement transactional proposal promotion into canonical M0 entities, source references, assertions, events, and append-only review decisions.
8. Add localhost-guarded APIs for owner aliases, run/resume, proposal listing, accept/reject/correct, merge, and split operations.
9. Expand the review queue UI with owner setup, run status, grouped explainable proposals, correction controls, merge/split confirmation, and accessible states.
10. Add migration, idempotency, interruption, owner-isolation, redaction, correction-preservation, export, backup, deletion, component, and E2E tests.
11. Update README, product/design guidance, roadmap, ADRs, and `COMPLIANCE.md` with M2 behavior, exclusions, engineering controls, and residual risks.
12. Run the focused and full verification sequence, fix failures without weakening assertions, and publish security then quality reports before M2 closeout.
