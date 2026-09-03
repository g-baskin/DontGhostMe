# ADR 0003: Classify locally into reviewable proposals

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Project owner and implementation agent
- **Supersedes:** Nothing
- **Related:** ADR 0002, `docs/plans/m2-recruiter-opportunity-discovery.md`

## Context

M2 must discover recruiter relationships and opportunities from M1's inert normalized messages without turning uncertain interpretation into product fact. MBOX headers do not reliably identify the mailbox owner, names do not uniquely identify people, domains do not prove employment, and silence does not prove rejection. Email content and addresses are sensitive personal data and must remain local.

## Decision

1. The candidate confirms their own mailbox address and aliases before classification; ambiguous direction remains `unknown`.
2. A versioned deterministic rules engine classifies bounded M1 projections locally. It makes no network, model, analytics, verification, or enrichment call.
3. Every result is persisted as a proposal with a stable key, ruleset hash, integer confidence contributions, bounded inert excerpts, and source-message provenance.
4. Proposals remain separate from canonical M0 recruiters, organizations, opportunities, conversations, communications, affiliations, submissions, assertions, and review decisions.
5. Acceptance or correction promotes canonical facts in one immediate transaction and writes compatible source references, evidence assertions, and append-only review history.
6. Rejection preserves evidence. Reprocessing supersedes only undecided proposals and never overwrites a prior user decision.
7. Names, display names, and domains never authorize identity merges. Cross-address merges, splits, company changes, ambiguous grouping, and submissions require explicit confirmation.
8. Submission proposals require recruiter-authored language explicitly stating that a profile, résumé, or candidacy was submitted or presented to a named client.
9. Opportunity outcome remains `unknown`; silence and elapsed time do not create outcome evidence.
10. Export, backup, owner deletion, local-origin mutation checks, byte caps, redacted errors, and accessibility protections extend to all M2 data and controls.

## Consequences

### Positive

- Classification is reproducible, inspectable, correctable, and usable offline.
- Uncertain machine output cannot silently appear as an accepted recruiter or submission fact.
- Ruleset changes are auditable and preserve user decisions.
- The candidate controls mailbox identity instead of relying on an unreliable archive inference.

### Negative

- Candidates must confirm aliases and review proposals before canonical records become useful.
- Hand-authored phrase rules have bounded recall and require a maintained synthetic evaluation corpus.
- Promotion order matters when an opportunity depends on an accepted recruiter and affiliation.
- Local synchronous batches suit the current single-user application, not a future hosted multi-writer service.

## Alternatives considered

### External AI or embeddings

Rejected for M2. They would transmit sensitive content or add model/version uncertainty without first proving the deterministic baseline.

### Write classifier output directly into canonical tables

Rejected. Confidence is ranking guidance, not truth, and direct writes would blur proposals with accepted facts.

### Infer the mailbox owner from message frequency

Rejected. Forwarded mail, aliases, mailing lists, and multi-recipient messages make this unreliable.

### Merge identities by equal name or organization

Rejected. Common names and job changes make false merges likely and difficult to reverse.

### Infer rejection from silence

Rejected. Absence is not outcome evidence and would contradict the product's evidence-first model.
