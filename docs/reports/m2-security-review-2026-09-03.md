# M2 security review

**Date:** 2026-09-03  
**Scope:** M2 classification rules, persistence, promotion, local APIs, review UI, migration, export, backup, and deletion  
**Result:** No confirmed exploitable finding remains in the reviewed scope.

## Trust boundaries reviewed

- Imported normalized message fields and inert text are untrusted input.
- Corrected proposal JSON and owner aliases are user-controlled request data.
- Every mutation is local-origin guarded and every query/mutation is owner-scoped.
- Classification is local and deterministic; no content, address, proposal, or decision leaves the device.

## Confirmed controls

- Parameterized SQLite statements; the only dynamic SQL identifiers come from a fixed internal deletion/merge allowlist.
- Bounded request JSON, corrected proposal values, persisted proposal JSON, excerpts, batches, and confidence ranges.
- Exact owner-email matching; names and domains have no identity-merge authority.
- Stable run and proposal keys, checkpoint compare-and-swap, immediate transactions, optimistic decision revisions, and redacted failed-run recovery.
- Transactional promotion writes canonical entities, source references, assertions, and append-only decisions together.
- Submission, grouping, organization change, merge, and split paths require user review.
- Arbitrary errors map to allowlisted codes; no message content is logged.
- M2 tables participate in owner export, backup verification, and foreign-key-safe deletion.

## Review correction

Mailbox aliases are classifier inputs. The initial source-set digest covered messages but not confirmed owner aliases, so an alias correction could have reused a completed run. The digest now includes sorted normalized owner aliases. Replacement proposals locate prior undecided proposals by message and type, while decided history remains untouched.

## Verification

- Security guardian focused suite: 6 files and 28 tests passed before review corrections.
- Post-correction full suite: 20 files and 86 tests passed.
- Frozen install, diff, Biome, TypeScript, export, build, 8 Playwright tests, backup, and database integrity/foreign-key verification passed.
- Full command evidence is recorded in the M2 quality report.

## Residual risk

- Rules can miss recruiter language outside the synthetic corpus; proposals are guidance, not truth.
- Local database confidentiality depends on the user's device account, disk protection, and backup handling.
- This review covers the local single-user architecture, not a future hosted or multi-writer deployment.
