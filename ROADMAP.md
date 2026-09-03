# DontGhostMe Roadmap

This roadmap sequences learning and risk reduction. A milestone is not automatically approved merely because it appears here. Complete planning and obtain user approval before implementing a milestone that introduces external services, sensitive data, or irreversible architecture.

**Current status (2026-09-03):** M0 is implemented and verified. M1 safe historical import is the next planning milestone and is not implemented.

## M0 — Product scaffold ✅

**Goal:** Establish a light, high-quality local foundation and prove the recruiter-history model with one complete synthetic vertical slice.

Approved direction:

- Bun package manager and command runner with a committed `bun.lock`; application code remains Node-compatible.
- Current stable Next.js App Router, React, and strict TypeScript.
- Biome for formatting, imports, and primary linting; no Prettier. Add targeted ESLint only after documenting a material rule gap and obtaining approval.
- SQLite with Drizzle for the local single-user product. PostgreSQL is deferred until multi-user/multi-writer deployment requires it.
- Vitest, React Testing Library, and Playwright; do not substitute `bun test` for the selected runners.

Deliverables:

- Short architecture decision record for the exact versions, SQLite driver, runtime boundary, and future PostgreSQL trigger.
- Reproducible `bun` commands for install, development, formatting/lint checks, type-checking, unit tests, end-to-end tests, and production build.
- SQLite startup verification for foreign keys, WAL mode, busy timeout, durability policy, FTS5 availability when introduced, and a patched runtime version.
- Clear application, domain, persistence, ingestion, and future integration boundaries.
- Initial domain contracts for recruiter, recruiter identity, organization, affiliation history, opportunity, submission, conversation, communication event, extracted event, source reference, confidence, and review state.
- Accessible application shell for Home, Recruiters, Recruiter Detail, Opportunities, Review Queue, and Data & Privacy.
- Synthetic Jane Recruiter history spanning an old employer/address and a new employer/address, two separate opportunities, candidate replies, resume and right-to-represent requests, explicit submission evidence, recruiter follow-up, interview request, and unknown outcome.
- Derived first/last contact, directional message counts, follow-up count, opportunity count, submission count, and unknown-outcome count.
- At least one user correction workflow with preserved source evidence, confidence, and review state.
- Unit tests for critical interpretation rules and one Playwright vertical-slice test.
- No live external integrations or real personal data.

Exit criteria:

- A new contributor can run the project from documented Bun commands without a PostgreSQL server or hosted dependency.
- All Biome, TypeScript, unit-test, end-to-end, and build gates pass.
- The UI shows Jane as one person with multiple dated identities/affiliations and keeps the two opportunities separate.
- Only explicit evidence or user confirmation marks a submission; unresolved history remains `unknown`.
- The architecture does not require Gmail, LinkedIn, an LLM, a hosted service, or a Bun-only application API.
- Domain services do not depend directly on Drizzle/SQLite, preserving an intentional future PostgreSQL migration path.

## M1 — Safe historical import

**Goal:** Import synthetic Google Takeout/MBOX data safely and idempotently.

Deliverables:

- Threat model and import limits approved first.
- Streaming or bounded parsing appropriate for large archives.
- MIME normalization, safe text extraction, quoted-history handling, and attachment inventory without execution.
- Source provenance and content hashing.
- Idempotent repeat import and resumable failure behavior.
- Synthetic adversarial fixtures for malformed MIME, huge inputs, archive/path attacks, duplicate messages, encoded headers, HTML/script content, and hostile prompt text.

Exit criteria:

- Re-importing the same archive creates no duplicate source messages or events.
- Malformed or malicious fixtures fail safely without leaking content to logs.
- No real mailbox archive is required for automated testing.

## M2 — Recruiter and opportunity discovery

**Goal:** Turn normalized messages into correctable recruiter, identity, organization, opportunity, and event candidates.

Deliverables:

- Deterministic detection baseline.
- Explainable evidence and confidence for every proposed classification.
- Review workflows for recruiter detection, identity merge/split, opportunity grouping, company changes, and submission claims.
- Versioned extraction/classification so records can be reprocessed.
- Evaluation set using synthetic labeled conversations.

Exit criteria:

- The system never promotes an uncertain submission to a confirmed fact without evidence or user confirmation.
- Ambiguous people are not merged by name alone.
- Unknown outcomes remain first-class.

## M3 — Useful local product

**Goal:** Make the imported history useful without a persistent mailbox connection.

Deliverables:

- Recruiter directory and unified timeline.
- Opportunity pipeline and evidence-backed stage history.
- First/last contact and clearly defined communication metrics.
- Filters for active, dormant, do-not-contact, excluded, uncertain, and possible company change.
- User correction, exclusion, export, and deletion workflows.
- Accessible empty, loading, error, and large-data states.

Exit criteria:

- The product satisfies the success signal in `docs/PRODUCT_BRIEF.md` using synthetic data.
- Corrections survive reprocessing and do not silently disappear.

## M4 — Read-only Gmail synchronization

**Goal:** Add continuing Gmail updates without granting any mailbox mutation capability.

Prerequisites:

- Security and privacy review.
- Auth-provider decision record.
- Verification of exact requested scopes and consent screen.
- Data-retention and deletion behavior tested.

Constraints:

- Request only `gmail.readonly` plus minimum identity scopes.
- Expose only required read/list/search/history operations.
- No send, draft, compose, modify, label, archive, trash, or delete operations.
- If Composio is used, disable payload logging before the first Gmail read.
- Full backfill and incremental `historyId` synchronization must be resumable and idempotent.

Exit criteria:

- Automated tests prove no mailbox-mutating scope or operation exists.
- Disconnect and deletion work without changing Gmail.
- Lost/expired history checkpoints trigger safe reconciliation.

## M5 — Authorized supplemental inputs

Potential features, each requiring separate approval:

- User-uploaded official LinkedIn data export.
- Manual recruiter and company corrections.
- LinkedIn notification-email interpretation.
- User-initiated, selective email deliverability checks.

Prohibited direction:

- LinkedIn scraping, private APIs, session cookies, DOM automation, or automated messaging.
- Bulk address probing or test-message sending.

## M6 — Multi-user product evaluation

**Goal:** Decide whether DontGhostMe should become a hosted SaaS product.

Required work before implementation:

- Google restricted-scope verification and security-assessment analysis.
- Tenant isolation and encryption design.
- Authentication and account-recovery design.
- User-data policy, privacy disclosures, export, retention, revocation, and deletion.
- Connector evaluation: Composio, Nylas Shared Google App, and Pipedream Connect.
- Abuse prevention and operational threat model.
- Cost model for mailbox history, storage, classification, and support.

This milestone should not compromise the candidate-owned, read-only product boundary.
