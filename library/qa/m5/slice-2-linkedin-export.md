# M5 Slice 2 — Official LinkedIn export ingestion

## Result

Extended the M1 historical-import lifecycle with a second source kind (`linkedin_export`) behind a source-adapter dispatch, added migration 0005 (`historical_imports.source_kind`, `import_checkpoints.logical_cursor_json`, `import_source_records`, `linkedin_export_row` proposal type), a hostile-input-hardened ZIP/CSV parser (`yauzl@3.4.0`, `csv-parse@7.0.2`, both MIT, engines `>=18`, no install scripts, verified from pinned source before install), review-required proposals with proof boundaries, source-type selection in the Imports workspace, both source kinds in Data & Privacy inventory/deletion copy, portable export version 3, and import/owner deletion coverage.

## Security and durability review (built in, then reviewed)

- ZIP entries are validated before streaming: encrypted flags, absolute/traversal/NUL/duplicate/symlink-like paths, nested archives, entry/size/ratio limits (100 entries, 100 MiB entry, 500 MiB total, 100:1), 1,000,000 rows, 128 columns, 256 KiB fields. Nothing is extracted to disk; recognized entries stream through memory.
- Preview stores inventory counts only; source records and proposals begin only after explicit confirmation (tested).
- Rows become `user_review` proposals and never auto-create recruiters/opportunities/submissions (tested: counts are zero after a completed import).
- Connections/invitations carry a `relationship_clue_only` proof boundary; job applications carry `application_record_only`.
- Content-type allowlist per stored source kind; adapter chosen from stored state, never request headers after creation.
- Bounded batches write records + proposals + checkpoint logical cursor in one `BEGIN IMMEDIATE` transaction; re-runs are idempotent via unique (import, dataset, row) and (run, proposal_key) constraints.
- Logs and errors carry codes/counts only; no row values, names, or raw filenames.
- Owner deletion includes `import_source_records` in foreign-key-safe order; import deletion removes the LinkedIn classification run/proposals and cascades source records.

What was not checked: full-repo secret history scan and lockfile-wide dependency audit remain outside this slice review.

## Runtime evidence

- `npm run typecheck` — passed.
- `npm test` — 104 tests across 27 files, including new parser limits/schema-drift/preview-purity/lifecycle tests.
- Fresh-database migration drill (`DATABASE_PATH=… db:migrate && db:verify`) — `integrity ok`, zero foreign-key issues; existing database migrated with zero proposal-row loss (0→0).
- `npm run check` — 145 files clean.
- `npm run build` — passed.
- `npm run db:seed && npm run test:e2e` — 12 browser tests (see final gate below for the full-suite pass).
- `npm run db:verify`, `npm run test:export` — passed, no path leak.
