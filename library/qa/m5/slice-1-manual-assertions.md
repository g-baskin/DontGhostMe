# M5 Slice 1 — Manual assertions

## Result

Implemented owner-scoped manual recruiter, organization, and opportunity creation; immutable field corrections; stale-revision rejection; retraction fallback; manual-over-machine projections; portable export format 2; and foreign-key-safe owner deletion.

## Security and durability review

- Mutations use the existing local-origin guard.
- All entity lookups and writes bind `owner_id`; cross-owner resources return not found.
- Canonical creation, source provenance, and manual assertions share one `BEGIN IMMEDIATE` transaction.
- Values are field-allowlisted, size-constrained, and validated at the application and database boundaries.
- History is immutable except idempotent `retracted_at`; supersession is unique.
- No outbound networking, telemetry, mailbox access, scraping, or external AI was added.

No exploitable source-to-sink path was found in the changed slice after review. This is not a security certification. Dependency and full-history secret scans were not part of this slice review.

## Runtime evidence

- `npm run typecheck` — passed.
- `npm test` — 100 tests passed across 25 files.
- `npm run db:seed && npm run test:e2e` — 12 browser tests passed, including axe, keyboard, and narrow reflow checks.
- `npm run check` — passed, 141 files checked.
- `npm run build` — production build passed.
- `npm run db:migrate` — migration 0004 applied.
- `npm run db:verify` — integrity `ok`, zero foreign-key issues.
- `npm run test:export` — passed with no local-path leak.
- Focused rollback/history/owner-isolation/export checks: `npx vitest run tests/db/manual-assertions.test.ts tests/db/m3-migration.test.ts` — 3 tests passed.

## Quality review

The slice matches the approved manual-data boundary. Manual creation without communication history now renders explicit unknown contact dates rather than inventing events. Remaining M5 source kinds are intentionally absent until slices 2 and 3.
