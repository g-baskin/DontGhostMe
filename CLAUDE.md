<!-- gg:init:start -->

# DontGhostMe

DontGhostMe is a candidate-owned recruiter relationship tracker. It reconstructs a job seeker's recruiting history from email, turns ambiguous conversations into a correctable timeline, and preserves recruiter relationships even when recruiters disappear, reappear, use another address, or change companies.

## Read order

1. This file.
2. `docs/PRODUCT_BRIEF.md`.
3. `ROADMAP.md`.
4. `docs/research/product-landscape.md` before making integration or market claims.

## Product thesis

Existing job trackers are application-centered and usually manual. Personal CRMs understand people but not submissions, interviews, recruiter follow-ups, or unknown outcomes. DontGhostMe joins those models into a private, recruiter-centered history owned by the candidate.

The core question is not merely "Where did I apply?" It is:

> Who contacted me, what opportunity did they discuss, was I submitted, what happened afterward, and where is that recruiter now?

## Required outcomes

For each recruiter, the product should eventually show:

- First observed contact and most recent contact.
- Current and historical companies and email identities.
- Recruiter messages, candidate replies, unanswered messages, and inferred follow-ups/re-sends.
- Every associated opportunity and its current or last-known status.
- Whether submission occurred, with evidence and confidence rather than unsupported certainty.
- A chronological, source-linked timeline that the user can correct.
- Dormant, do-not-contact, uncertain, and active relationship states.

## Privacy and authorization invariants

These are architectural requirements, not optional polish:

- Gmail is read-only. The planned content scope is exactly `https://www.googleapis.com/auth/gmail.readonly` plus the minimum identity scopes required by the authentication flow.
- Never implement email sending, drafting, editing, labeling, archiving, trashing, or deleting.
- Do not request `gmail.modify`, Gmail compose/send scopes, or the broad `mail.google.com` scope.
- Prefer a one-time local Google Takeout import for the first proof of concept. Live Gmail synchronization is a later milestone.
- If Composio is evaluated for managed Gmail authentication, payload logging must be disabled before the first Gmail read. Its documented default may retain request/response payloads for up to one year.
- Read-only mailbox access still exposes highly sensitive information. Minimize collection, retrieval, retention, logging, and third-party processing.
- Store derived structured facts and minimal supporting excerpts where possible, not an unnecessary permanent copy of the mailbox.
- A public multi-user version using Gmail restricted scopes requires a dedicated compliance and security plan.
- No LinkedIn scraping or browser automation. Allow only authorized inputs such as a user-uploaded LinkedIn data export, manual entry, or LinkedIn notification emails already present in Gmail.
- Email verification must be explicit and selective. A verifier can estimate deliverability; it cannot prove that a recruiter still owns, monitors, or consents to contact at an address.

## Domain boundaries

Keep these concepts separate:

- **Recruiter**: the person, independent of any one employer or email address.
- **Recruiter identity**: an email address or authorized profile identifier observed during a period.
- **Organization affiliation**: a recruiter's relationship with a staffing company or employer over time. Never overwrite history when the company changes.
- **Opportunity**: a distinct role discussed with the candidate, potentially involving a staffing company and a different end client.
- **Submission**: an event/claim that the candidate was presented for an opportunity. It requires source evidence and may remain uncertain.
- **Conversation**: a provider thread or normalized set of related messages.
- **Communication event**: one inbound or outbound message with source provenance.
- **Extracted event**: a classified fact such as outreach, candidate reply, follow-up, right-to-represent request, submission, interview, rejection, offer, withdrawal, or unknown outcome.
- **Source reference**: a durable pointer to the imported message/export record that supports an extracted fact.
- **Confidence and review state**: machine confidence plus unreviewed, confirmed, corrected, or rejected status.

Do not collapse recruiter, recruiter email, organization, end client, opportunity, or conversation into one record.

## Interpretation rules

- "First contact" and "last contact" are derived from observed communication events, not manually duplicated fields.
- Track inbound recruiter-message count separately from candidate-reply count.
- A "follow-up" or "re-send" is an inference, not simply another message. It generally means a materially related recruiter message sent before the candidate replied; retain the evidence and confidence.
- "Submitted" must not be inferred only because a recruiter requested a resume. Prefer explicit language such as submitted, presented, sent to the client, or a user confirmation.
- No response does not automatically mean ghosting. Allow states such as awaiting response, dormant, closed without outcome, and likely ghosted.
- Person matching must tolerate multiple addresses but must not merge people based on name alone. Ambiguous identity matches require review.
- Company changes create dated affiliation history; they do not replace old history.
- Keep raw source facts separate from model-generated summaries so records can be reprocessed and audited.

## Ingestion strategy

The planned sequence is:

1. One-time local Google Takeout import using synthetic fixtures during development.
2. Deterministic parsing and normalization before any optional model-assisted classification.
3. Candidate/recruiter detection and a human review queue.
4. Local recruiter, opportunity, and timeline experience.
5. Read-only incremental Gmail synchronization using managed authentication after a security review.
6. Optional authorized LinkedIn-export import.
7. Optional selective address verification, never automatic bulk probing or messaging.

Initial discovery should use headers, participants, dates, subjects, labels, and snippets first. Retrieve/process full bodies only when needed. Strip quoted history and signatures carefully while retaining immutable source references.

## Security baseline

- Treat MIME, HTML, text, attachments, CSV files, MBOX files, and provider payloads as hostile input.
- Prevent path traversal, archive bombs, oversized-message exhaustion, HTML/script execution, formula injection, prompt injection, and unsafe attachment handling.
- Sanitize rendered email HTML or prefer safe plain text.
- Never execute attachment content.
- Enforce upload, message, attachment, and extraction limits.
- Redact personal data from errors and logs.
- Keep secrets in environment variables and maintain a safe `.env.example` only after a stack is selected.
- Use synthetic adversarial fixtures and test duplicate import, malformed MIME, conflicting identities, and uncertain classification.

## Approved scaffold direction

The project remains pre-scaffold and has no production integration, but the initial toolchain and persistence direction are now set:

- Use **Bun** as package manager and project command runner. Commit `bun.lock`, set the `packageManager` field, pin Bun in CI, use `bun install --frozen-lockfile`, and do not create a competing npm, pnpm, or Yarn lockfile.
- Keep application code **Node-compatible**. Bun is the fast package/install/script layer; do not couple core code to `Bun.serve`, `bun:sqlite`, or another Bun-only API without an approved architecture decision.
- Use the current stable **Next.js App Router**, React, and strict TypeScript.
- Use **Biome** for formatting, import organization, and primary linting. Do not add Prettier.
- Require `tsc --noEmit`. Begin without ESLint; if specialized Next.js, React Hooks, or React Compiler rules are materially missing, identify the exact gap and request approval for a small targeted ESLint backstop.
- Use **Vitest** and React Testing Library for unit/component tests and **Playwright** for end-to-end tests. `bun test` is not a substitute for those test runners.
- Use **SQLite** with Drizzle for the local single-user product through M4. Mailbox volume alone does not justify PostgreSQL; multiple independent writers, hosts, application instances, workers, and tenants do.
- Evaluate `node:sqlite`, `better-sqlite3`, and local libSQL before selecting a driver. Prefer a standard driver behind repositories; do not select `bun:sqlite` without approval for Bun-runtime coupling.
- Configure and verify SQLite foreign keys, WAL mode, a bounded busy timeout, and an explicit durability policy at startup.
- Require a SQLite release containing the current WAL-reset corruption fix (3.51.3+ or an explicitly documented patched maintenance release) and assert the runtime version.
- Parse imports outside the database and persist short, resumable, idempotent batches rather than one mailbox-wide transaction.
- Use FTS5 only through reviewed migrations and verify that the selected SQLite runtime includes it.
- Keep stable application-generated IDs, UTC timestamps, ownership fields, provenance hashes, repository boundaries, and a portable export format so a future PostgreSQL migration is controlled.
- Drizzle does not make SQLite-to-PostgreSQL conversion automatic. PostgreSQL will require a separate schema, migrations, rebuilt search indexes, validation, and cutover plan.
- Defer PostgreSQL until hosted multi-user operation requires tenant isolation, multiple application instances, independently writing workers, or writers on different hosts.

The first vertical slice is an evidence-backed, user-correctable recruiter timeline built entirely from synthetic data. It must demonstrate one recruiter using old and new company identities across two opportunities, candidate replies, a resume request, right-to-represent, explicit submission evidence, a follow-up, an interview request, and an unresolved outcome.

The initial scaffold must provide reproducible install, development, check, type-check, test, end-to-end test, and build commands; establish domain and persistence boundaries; render the synthetic recruiter experience; and test the critical interpretation rules. It must not add live Gmail, LinkedIn, AI, analytics, enrichment, email verification, or outbound messaging.

Run `.gg/commands/scaffold.md` as the project scaffold command. It contains the complete M0 procedure and approval gate.

<!-- gg:init:end -->
