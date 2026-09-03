# Compliance Register

Snapshot: 2026-09-03 · Reviewed by: GG Coder compliance-guard · **NOT LEGAL ADVICE**

## Assumed exposure profile

- **Reach — confirmed from code:** local loopback application; no public deployment configuration reviewed.
- **People — confirmed from product:** candidate-side personal organization, not employer ranking or hiring decisions.
- **Data — confirmed from code:** imported email addresses, inert message text, bounded excerpts, recruiter proposals, and user decisions.
- **Third parties — confirmed from code:** no M2 network, AI, analytics, telemetry, verification, or enrichment service.
- **Money and minors — confirmed from code:** no payment flow or child-directed feature in M2.
- **Jurisdiction — unknown:** future users and distribution locations are not established in this repository.

## Findings

| ID | Severity | Trigger | Evidence | Obligation | Status | Guard |
| --- | --- | --- | --- | --- | --- | --- |
| PRIV-001 | HIGH | Sensitive mailbox content | CODE | Keep processing local, bounded, correctable, exportable, and deletable | Implemented | M1/M2 privacy, export, and deletion tests |
| AUTO-001 | HIGH | Employment-related classification | CODE | Do not make employer-side rankings or unreviewable consequential decisions | Implemented | Proposal-only model and explicit review tests |
| IDENT-001 | HIGH | Person identity linking | CODE | Prevent silent name/domain merges and preserve correction history | Implemented | Exact-address and zero-name-merge evaluation tests |
| SUBMIT-001 | HIGH | Submission claims | CODE | Require explicit evidence and user confirmation | Implemented | Strict phrase rules, negative fixtures, confirmation UI |
| ACCESS-001 | MEDIUM | Public-facing review controls if deployed | RUNTIME | Preserve labels, keyboard order, reflow, contrast, and status announcements | Implemented for automated checks | Playwright axe, keyboard, forced-colors, text-spacing, and reflow checks |
| DEVICE-001 | MEDIUM | Local SQLite and staged mailbox data | DEDUCED | Protect the device account, disk, and backups | Open outside application | User/device operations guidance |

## Implemented in this pass

- Confirmed-owner aliases gate message direction.
- Classification runs record engine version, ruleset hash, source-set hash, checkpoints, and allowlisted errors.
- Proposals retain confidence contributions and bounded excerpts from inert M1 text only.
- User decisions are append-only; accepted/corrected facts promote transactionally with provenance.
- Export, backup, and owner deletion include every M2 table.
- Mutation routes retain exact local-origin checks and redacted errors.

## Open — needs a decision from you

- None for the approved local M2 scope.

## Needs a lawyer

- Before public or multi-user distribution, counsel should review the actual operator, jurisdictions, retention disclosures, user rights process, and employment-data positioning.

## Re-verify before relying

- This register describes observed engineering controls, not legal conformity.
- Manual VoiceOver/Safari review remains necessary; automated accessibility checks are not a full audit.
- Re-run this review if Gmail synchronization, hosting, analytics, AI, employer access, or outbound messaging is proposed.
