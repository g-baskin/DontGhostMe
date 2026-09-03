# M5 Slice 3 — Notification-email interpretation

## Result

Added `linkedin_notification` as a review-only classification proposal type (migration 0006 extends the database-enforced proposal domain), deterministic recognizers in `src/classification/linkedin-notifications.ts`, appended after normal direction classification in `classifyMessage`, Review Queue type filters for both new LinkedIn types, and export/privacy copy covering notification provenance.

## Product and security review

- Reads only already-imported `normalized_messages`; no fetching, HTML rendering, link/image loading, attachment inspection, or LinkedIn contact.
- Deterministic sender (linkedin.com notification domains) **plus** explicit message-structure evidence is required; sender-only matches return nothing (spoof test).
- Every proposal is `user_review` with bounded excerpts (≤280 chars), source message ID, occurred time, event kind, and confidence reasons in the signal codes.
- Decisions on `linkedin_notification`/`linkedin_export_row` never promote or mutate recruiters, opportunities, submissions, or relationship statuses; submission proof rules unchanged.
- Manual-assertion precedence, owner scoping, and deletion paths are unchanged and still tested.

Not checked: full-repo secret history scan (unchanged by this slice).

## Runtime evidence

- `npm run typecheck` — passed.
- `npx vitest run tests/classification tests/db/classification.test.ts` — 16 passed.
- `npx vitest run tests/classification/linkedin-notifications.test.ts` — 4 passed (spoof, structure, domain-lookalike, event kinds).
- Fresh-database migration drill and existing-database migration for 0006 — `integrity ok`, zero foreign-key issues.
- Serial re-runs of the load-flaky timing tests (`mime-parser`, `historical-import`, `import-resume-100`) — all passed (19 tests).
- `npm run check` — 147 files clean. `npm run build` — passed.
- Full `npm test` — 103/108 under concurrent machine load; the 5 failures were all pre-existing timing-budget flakes, each verified passing serially afterward.
