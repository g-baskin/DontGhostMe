---
name: scaffold
description: Plan and, after approval, build the DontGhostMe M0 Bun/Biome/SQLite scaffold
---

# DontGhostMe M0 scaffold

Work only in the current DontGhostMe repository. This command begins M0; it does not authorize later roadmap milestones.

## 1. Load authoritative context

Before planning or changing code, read these files completely and in order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PRODUCT_BRIEF.md`
4. `ROADMAP.md`
5. `docs/research/product-landscape.md`
6. `README.md`

Inspect `git status`, the existing tree, current branch, and available tool versions. Preserve all documentation, license files, README content, and its referenced hero image. Do not discard, overwrite, stage, commit, or push existing work. Two alternate hero images may be untracked; leave them untouched unless the user separately decides their disposition.

## 2. Product objective

Build the first proof of truth—not Gmail OAuth and not a decorative dashboard disconnected from the domain:

> Load a fully synthetic recruiter conversation, normalize it into domain records, and display an evidence-backed recruiter timeline whose uncertain facts the user can review and correct.

The synthetic history must show:

1. Jane Recruiter contacts the candidate from `jane@oldagency.example`.
2. Jane presents a software-engineering opportunity.
3. The candidate replies.
4. Jane requests a resume.
5. Jane requests right-to-represent confirmation.
6. The candidate confirms.
7. Jane explicitly says the candidate was submitted.
8. Jane follows up and requests an interview.
9. The first opportunity ends without a documented outcome.
10. Months later Jane contacts the candidate from `jane@newagency.example`.
11. Her new signature identifies a different employer.
12. Jane presents a second, separate opportunity.

The result must model Jane as one person with multiple historical email identities and dated company affiliations. The two opportunities must remain separate. The first timeline must support first/last contact, recruiter-message count, candidate-reply count, inferred follow-up count, current unanswered side, opportunity count, explicit-submission count, and unknown-outcome count.

Every extracted/inferred fact must preserve a source reference, minimal supporting excerpt, confidence, and review state. At least one proposed fact must be confirmable or rejectable by the user.

## 3. Approved stack direction

Use this direction unless evidence discovered during planning reveals a material incompatibility. If so, stop and present the evidence rather than silently substituting tools.

### Bun

- Use the current stable Bun as package manager and project command runner.
- Set an exact `packageManager` version and commit only `bun.lock`.
- Do not create `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`.
- Use `bun install --frozen-lockfile` in CI.
- Keep application code Node-compatible. Do not couple core code to `Bun.serve`, `bun:sqlite`, or another Bun-only API without a separately approved architecture decision.
- Pin Bun in development/CI and document the supported version.
- Use `bun run <script>` for project commands. Do not assume every subprocess uses the Bun runtime merely because Bun launched the script.

Bun is selected for faster installation and lighter command tooling, not as evidence that application runtime performance will automatically improve.

### Next.js and TypeScript

- Use the current stable Next.js App Router and React versions supported together at scaffold time.
- Use strict TypeScript.
- Keep server-only code out of client bundles.
- Prefer one well-structured application over microservices or an unnecessary monorepo.

### Biome

- Use Biome for formatting, import organization, and primary linting.
- Do not add Prettier.
- Require `tsc --noEmit` as a separate gate.
- Begin without ESLint. If Biome lacks a material Next.js, React Hooks, React Compiler, Playwright, or Drizzle correctness rule, list the exact missing rule and request approval for a small targeted ESLint backstop.
- Explicitly review Biome nursery rules relevant to React, Next.js, Playwright, and destructive Drizzle operations; do not assume the recommended preset enables them.

### Tests

- Use Vitest for domain/application unit tests.
- Use React Testing Library for component behavior.
- Use Playwright for browser-level end-to-end tests.
- Do not replace Vitest or Playwright with `bun test`.
- Test the supported runtime combinations rather than assuming Bun compatibility.

### SQLite and Drizzle

- Use SQLite with Drizzle through the local single-user product and read-only Gmail-sync milestones.
- Mailbox volume alone is not a reason to use PostgreSQL. SQLite can hold large relational histories and FTS5 indexes. PostgreSQL is deferred until independent workers/instances/hosts and multiple tenants need concurrent writes and operational isolation.
- Evaluate `node:sqlite`, `better-sqlite3`, and local libSQL against the selected Bun, Node, Next.js, Drizzle, Vitest, and deployment versions. Recommend one with compatibility evidence.
- Do not choose `bun:sqlite` unless the user approves Bun-runtime coupling.
- Keep domain/application services independent of Drizzle and SQLite behind explicit repository ports/adapters.
- Use application-generated stable IDs, UTC timestamps, ownership fields even in single-user mode, provenance hashes, and a portable export model.
- Do not claim Drizzle makes a later PostgreSQL conversion automatic. The PostgreSQL schema, dialect-specific migrations, search indexes, data conversion, validation, and cutover will be separate work.

At database startup, configure and verify—not merely request:

- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`
- A bounded `busy_timeout`
- An explicit, documented durability/synchronous setting
- Runtime SQLite version containing the current WAL-reset corruption fix: 3.51.3+ or an explicitly documented patched maintenance version
- FTS5 availability before relying on FTS5

Parse mailbox inputs outside database transactions. Persist short, resumable, idempotent batches rather than one transaction for an entire mailbox. Design for `SQLITE_BUSY`, interruption, retry, deduplication, checkpoints, and safe WAL checkpoint behavior. User corrections are more valuable than replayable imports and must receive the stronger durability treatment.

When FTS5 is introduced, create it through reviewed custom SQL migrations, keep it transactionally synchronized with its source content, and index normalized searchable text rather than attachments or an unnecessary permanent duplicate of the whole mailbox.

### Future PostgreSQL trigger

Do not add PostgreSQL during M0. Record that migration becomes necessary before hosted multi-user operation when DontGhostMe needs one or more of:

- Multiple application instances writing concurrently
- Independent background workers writing concurrently
- Writers on different hosts
- Tenant isolation and row-level security
- Hosted replication, point-in-time recovery, pooling, or network database access

Prepare—not implement—the future path: stable export, transformed PostgreSQL import, rebuilt search indexes, row/relationship/hash validation, representative timeline comparison, and controlled cutover.

## 4. Suggested source boundaries

Propose the smallest structure that preserves these boundaries; this is a guide, not a mandate to create empty folders:

```text
src/
  app/                    # Next.js routes/layouts
  features/
    recruiters/
    opportunities/
    review-queue/
    data-privacy/
  domain/                 # Pure contracts and interpretation rules
  ingestion/              # Normalization boundary; synthetic in M0
  db/                     # Drizzle schema/migrations/adapters/startup
  components/             # Shared accessible UI
  test/
    fixtures/             # Synthetic data only
```

Keep at least these concepts separate:

- Recruiter
- Recruiter identity
- Organization
- Dated organization affiliation
- Opportunity
- Submission
- Conversation
- Communication event
- Extracted event
- Source reference
- Confidence
- Review state and correction

Do not merge a recruiter with an email address, organization, end client, opportunity, submission, or conversation. Do not merge people by name alone. Do not infer submission from a resume request. Do not classify every silence as ghosting; unknown is a valid outcome.

## 5. M0 deliverables

Plan and, only after approval, implement:

1. A short ADR for the exact stack/runtime versions, SQLite driver, Bun/Node boundary, SQLite operating contract, and PostgreSQL migration trigger.
2. Reproducible commands for install, dev, Biome check/fix, TypeScript checking, unit/component tests, Playwright, database migration/seed, and production build.
3. Safe local configuration with no committed credentials or real personal data.
4. Version-controlled Drizzle schema and migrations.
5. SQLite initialization that applies and verifies the approved pragmas/version requirements.
6. Domain contracts and persistence adapters for the concepts above.
7. Synthetic Jane Recruiter fixtures and deterministic seed/load behavior.
8. Accessible application surfaces for Home, Recruiters, Recruiter Detail, Opportunities, Review Queue, and Data & Privacy; do not add empty routes merely to check boxes if they add no demonstrated value.
9. Recruiter detail timeline with identities, affiliations, two separate opportunities, source evidence, confidence, and review state.
10. Correctly derived metrics; do not persist redundant first/last/count fields unless a measured need and consistency mechanism are approved.
11. At least one correction flow that confirms or rejects an extracted event without destroying the source fact.
12. Unit tests for identity separation, opportunity separation, submission evidence, follow-up inference, unknown outcomes, and metric derivation.
13. One Playwright test for the complete Jane vertical slice.
14. Updated development instructions without removing the README's product explanation, image, boundaries, or license.
15. CI that uses the pinned Bun version and frozen lockfile and runs all approved quality gates.

Expected command surface should be coherent and small, such as:

```text
bun install
bun run dev
bun run check
bun run check:fix
bun run typecheck
bun run test
bun run test:e2e
bun run db:migrate
bun run db:seed
bun run build
```

Exact names may change during the plan, but all capabilities must exist and be documented.

## 6. Non-negotiable exclusions

During M0, do not add:

- Live Gmail OAuth, Gmail synchronization, or any persistent mailbox token
- Composio, Nylas, Pipedream, or another connector
- Gmail send, draft, compose, modify, label, archive, trash, or delete scope/operation
- LinkedIn integration, scraping, DOM automation, session cookies, or hidden APIs
- AI/LLM calls, embeddings, hosted classification, or telemetry
- Email verification or address probing
- Analytics, crash reporting, or third-party tracking
- Outbound email or other communications
- Real mailbox messages, archives, recruiter identities, OAuth tokens, or production-like personal fixtures
- Unapproved services, dependencies, commits, or pushes

Treat future MBOX, MIME, HTML, text, attachments, archives, CSV, and integration payloads as hostile. Synthetic fixtures must cover malformed input, duplicate messages, conflicting identities, encoded headers, active HTML/script content, archive/path attacks, oversized content, and prompt-injection text when their ingestion milestone begins. Never execute attachments or render unsanitized email HTML. Never leak source content through errors or logs.

## 7. First response and approval gate

Do not modify application code on the first pass. Return a concise but complete plan containing:

1. Exact proposed Bun, Node compatibility target, Next.js, React, TypeScript, Biome, Drizzle, SQLite driver, Vitest, and Playwright versions.
2. SQLite-driver comparison and evidence for the recommendation.
3. Architecture and dependency-direction diagram or outline.
4. Initial relational schema, keys, constraints, indexes, and ownership/provenance strategy.
5. SQLite initialization, transaction, batching, retry, backup, and migration rules.
6. Dependency list with a reason for every direct dependency.
7. File-by-file implementation sequence.
8. Quality commands and CI gates.
9. Risks, assumptions, deliberately deferred work, and rollback strategy.
10. Verifiable M0 acceptance criteria.

Wait for explicit approval before implementation. After approval, stay within M0, run every quality gate, self-review the complete diff, and report changed files, test evidence, remaining risks, and uncommitted Git status. Do not commit or push unless explicitly instructed.
