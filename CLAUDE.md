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

## Current implementation status

M0 is implemented and verified as a local, synthetic vertical slice. The baseline uses Bun `1.4.0`, Biome, strict TypeScript, Next.js App Router, Vitest, Playwright, Drizzle, and `better-sqlite3`. Application code remains Node-compatible with Node `24.20.0` primary and `26.4.0` compatibility.

The implementation includes checked-in forward-only migrations; verified SQLite startup settings; deterministic, idempotent synthetic seed data; repository boundaries; recruiter metrics; append-only review decisions; portable export; six UI routes; and database, unit, component, build, accessibility, responsive, and browser checks.

Keep SQLite through the local single-user milestones. PostgreSQL remains deferred until hosted multi-user operation requires tenant isolation, multiple application instances, independently writing workers, or writers on different hosts.

M1 safe historical import is the next planning milestone and is not implemented. Imports must be parsed outside the database and persisted in short, resumable, idempotent batches. Do not add live Gmail, LinkedIn, AI, analytics, enrichment, email verification, telemetry, or outbound messaging without explicit approval.

<!-- gg:init:end -->
