# M1 implementation quality audit and closeout

**Date:** 2026-09-03  
**Plan:** `docs/plans/m1-safe-historical-import.md`  
**Security review:** `docs/reports/m1-security-review-2026-09-03.md`  
**Overall:** PASS for the local M1 implementation and required host gates. The Node 24/26 clean-container matrix remains a CI verification item; M2 should not begin until that matrix is green.

## Implementation summary

M1 adds an extracted-local-`.mbox` workflow from bounded staging through preview, normalized persistence, checkpoints, resumable processing, history, export, deletion, and source cleanup. It does not connect to Gmail, decompress archives, classify recruiters/opportunities, call AI, scrape LinkedIn, send messages, or add telemetry.

ADR 0002 records why M1 writes inert content to `normalized_messages` instead of M0 `communication_events`: those existing events require recruiter/conversation classification, which is expressly deferred to M2. Raw source metadata, normalized text, and product assertions therefore remain separate.

## Files created

- Import domain and ingestion: `src/domain/imports.ts`; `src/ingestion/{import-limits,mbox-framer,mime-parser,mime-worker,safe-text,staging}.ts`.
- Persistence/application: `src/db/{historical-imports,owner-data,write}.ts`; `src/application/{historical-imports,local-request}.ts`.
- APIs/UI: `src/app/api/imports/**`; `src/app/imports/page.tsx`; `src/components/import-workspace.tsx`.
- Migration: `drizzle/0001_safe_historical_import.sql`; `drizzle/meta/0001_snapshot.json`.
- Tests/fixture: `tests/application/local-request.test.ts`; M1 tests under `tests/db`, `tests/e2e`, and `tests/ingestion`; `src/test/fixtures/takeout-small.mbox`.
- Decision/reports: `docs/adr/0002-safe-historical-import.md`; M1 security and quality reports.

## Files changed

- Runtime/config: `.gitignore`, `package.json`, `bun.lock`, `vitest.config.ts`, `next-env.d.ts`.
- Existing data/app: `src/db/{schema,repositories}.ts`, `src/domain/repositories.ts`, `src/db/owner-data.ts`, `src/application/server.ts`, `src/components/app-shell.tsx`, `src/app/globals.css`.
- Operations/tests: `scripts/{db-backup,export-check}.ts`, `tests/db/repositories.test.ts`, `tests/e2e/jane-timeline.spec.ts`, Drizzle journal metadata.
- Status documentation: `README.md`, `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `DESIGN.md`, `docs/PRODUCT_BRIEF.md`, and the M1 plan.

## Schema and migration

The additive `0001_safe_historical_import.sql` leaves `0000_m0.sql` unchanged and adds:

1. `historical_imports` — owner-scoped state, source fingerprint/size, separate counters, expiry, redacted terminal code.
2. `import_checkpoints` — one committed byte offset, ordinal, and counters per import.
3. `import_source_messages` — byte provenance, raw/canonical hashes, supporting Message-ID, status, warning/error codes.
4. `normalized_messages` — bounded inert text and normalized headers, separate from M0 assertions.
5. `attachment_inventory` — bounded display metadata, decoded size, and SHA-256 only.
6. `import_errors` — allowlisted stage/code/ordinal records without content.

Foreign keys, owner scoping, indexes, export coverage, backup-required tables, and deletion order were updated. Migration-from-populated-M0 and `foreign_key_check` pass. The 100-message interruption test proves checkpoint/export equivalence after database close/reopen.

## Dependency and lockfile changes

- Added exact `postal-mime@3.0.0` (MIT-0, zero runtime dependencies) for worker-isolated MIME parsing.
- Added exact `html-to-text@10.0.1` (MIT) for inert bounded HTML-to-text conversion.
- `bun.lock` was updated by Bun 1.4.0 and frozen installation now reports no changes.
- Current audit reports no advisory for either M1 runtime dependency.
- Remaining advisory: moderate `GHSA-67mh-4wv8-2f99` for transitive `esbuild@0.18.20` under `drizzle-kit` tooling. It is not an M1 runtime dependency; loopback binding reduces its cited dev-server exposure.

## Acceptance criteria

| # | Result | Evidence |
| --- | --- | --- |
| 1 | PASS | Valid synthetic MBOX produces source provenance plus normalized messages; M0 assertions/events remain separate. |
| 2 | PASS | Correction-preservation test keeps accepted/rejected decisions and all M0 domain counts unchanged. |
| 3 | PASS | Preview reports discovered/oversized counts before normalized rows exist; E2E requires confirmation. |
| 4 | PASS | Missing/duplicate Message-ID, exact duplicates, and same-ID conflicts are tested without overwrite. |
| 5 | PASS | Central values are frozen; actual source/message/header/text/attachment/depth/batch/time/retention boundaries and redacted failures are exercised. |
| 6 | PASS | Streaming staging/framing uses fixed overhead plus one bounded message; MIME runs in disposable resource-limited workers. |
| 7 | PASS | CRLF/LF, one-byte boundaries, escaped `>From`, invalid source, and exact resume offsets pass. |
| 8 | PASS | Encodings, RFC 2047, IDNA, invalid dates, multipart/RFC822 depth, quote/signature stripping, and inert HTML pass. |
| 9 | PASS | A 100-message uninterrupted import equals a close/reopen/interrupted import after volatile IDs/timestamps are excluded. |
| 10 | PASS | User pause commits only completed frames; status/cancel/resume APIs preserve the checkpoint. |
| 11 | PASS | Source deletion passes for completion, terminal failure, expiry, explicit deletion, and startup/history cleanup paths. |
| 12 | PASS | One in-process batch lease plus `BEGIN IMMEDIATE` and bounded `SQLITE_BUSY` retry prevent concurrent writer races. |
| 13 | PASS | Source and MIME limit violations surface allowlisted codes; privacy test observes no content-bearing console call/error. |
| 14 | PASS | Export includes all six M1 collections without local paths; backup verifies every M1 table and foreign keys. |
| 15 | PASS | Only a small fictional `.example` MBOX fixture exists; no connector/AI/analytics/outbound dependency was added. |
| 16 | PASS | README, roadmap, product/design guidance, plan status, and ADR 0002 describe implemented M1 boundaries. |
| 17 | PARTIAL | Bun 1.4 host gates pass. Node 24/26 Docker checks exposed and fixed clean-checkout test paths, but final full matrix rerun remains CI work. |
| 18 | PASS | Chromium E2E covers keyboard order, axe, forced colors, reduced motion, text spacing, 320/640px reflow, preview/process/history/delete. VoiceOver remains manual. |

## Security-review result

Two confirmed defects were fixed before this audit:

- Next development/production commands now bind to loopback; browser mutations require exact same-origin host and port.
- Concurrent processing for one import now fails recoverably instead of racing a checkpoint/source deletion.

Quality verification also corrected complete staged writes, enabled bounded inline RFC822 parsing, added startup expiry cleanup, and made clean-checkout database tests create their contained `.local` parent. Seven suspected source-to-sink paths were dropped after verification; details are in the security report.

## Command ledger

### Required final gates

- `git diff --check` — PASS after removing two plan-document trailing spaces; final rerun PASS.
- `bun install --frozen-lockfile` — initial shell Bun 1.3.14 correctly rejected the 1.4.0 project; `/tmp/dontghostme-bun/bin/bun install --frozen-lockfile` — PASS, no changes.
- `bun run check` — initial implementation issues were fixed; final PASS, 86 files.
- `bun run typecheck` — PASS after correcting Playwright timeout API usage.
- `bun run test` — initial aggregate test timeouts were diagnosed; final PASS, 15 files/59 tests.
- `bun run test:export` — PASS; all M1 collections present and `pathLeak:false`.
- `bun run build` — PASS; all import routes and `/imports` compile.
- `bun run test:e2e` — selector/cleanup and realistic timeout failures were fixed; final PASS, 8 Chromium tests.
- `bun run db:backup` — PASS; `integrity:ok`, zero foreign-key issues, all M1 tables verified.

### Required focused verification

- `bun run test -- tests/db/m1-migration.test.ts` — PASS; populated M0 preserved and foreign keys valid.
- `bun run test -- tests/ingestion/privacy-log.test.ts` — PASS; redacted code and no console content.
- `bun run test -- tests/db/historical-import.test.ts -t "cleans expired staged sources"` — PASS.
- `bun run test -- tests/db/historical-import.test.ts -t "pauses at an exact checkpoint"` — PASS.
- `bun run test -- tests/db/import-resume-100.test.ts` — PASS; 100-message stable export equivalence.
- `bun run db:migrate` — PASS against the local database.
- `bun run db:seed` twice — PASS; remains idempotent at nine communications.
- `curl http://127.0.0.1:3000/imports` — HTTP 200; existing dev server was never started or stopped.
- Desktop/mobile screenshots — PASS visual inspection at 1440×1000 and 390×844.

### Security/dependency/environment checks

- `bun audit` — expected NONZERO: one inherited moderate esbuild tooling advisory; no M1 runtime advisory.
- `bun why postal-mime` / `bun why html-to-text` — PASS; exact direct dependencies confirmed.
- Tracked-file/dependency scan — PASS; no real mailbox/archive/database/backup or prohibited integration dependency found.
- Node 24/26 Docker verification — first run was killed during unconstrained installation; constrained clean runs exposed missing `.local` setup and later test-time budgets. Those test defects were fixed. Final matrix completion is deferred to CI because the containers captured pre-fix source and were stopped rather than misreported as green.

## Remaining manual verification

1. Let the existing Node 24.20/26.x CI matrix run from a future authorized commit; no commit or push was performed here.
2. Run VoiceOver on macOS through select, preview, confirm, progress, cancel/resume, history, and delete announcements.
3. Optionally test a user-owned mailbox only after M1 review; never add it to fixtures, logs, telemetry, or version control.
4. Track the inherited drizzle-kit/esbuild advisory and upgrade only when a verified compatible release removes the vulnerable transitive version.

## M2 planning recommendation

Plan M2 as a read-only consumer of `normalized_messages`: deterministic recruiter/conversation candidate matching, confidence/provenance, conflict queues, and correction preservation. Keep raw-source rows immutable, keep Message-ID non-unique, require user confirmation for uncertain identity/affiliation links, and do not add Gmail OAuth, LinkedIn access, AI, analytics, verification, or outbound messaging without separate approval.
