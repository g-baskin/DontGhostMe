# M1 plan — Safe historical import

**Status:** Implemented and locally verified 2026-09-03; Node 24/26 CI matrix pending
**Prepared:** 2026-09-03
**Goal:** Import synthetic Google Takeout MBOX data safely, incrementally, and idempotently into the existing source-reference, normalized communication-event, and evidence pipeline.

## Scope and non-goals

M1 accepts a local `.mbox` file selected in the browser and processes it without changing Gmail. Compressed ZIP, TAR, TGZ, and GZIP archives are rejected in M1; users extract the Takeout archive locally and select the contained MBOX. This removes archive decompression and entry-path traversal from the reachable attack surface.

M1 does not add Gmail OAuth or synchronization, Composio, Nylas, Pipedream, LinkedIn access, AI/LLM calls, analytics, telemetry, email verification, outbound messaging, automatic attachment extraction, or real fixtures. It does not infer uncertain submissions as facts.

## 1. Threat model

### Assets and trust boundaries

- **Assets:** local mailbox content, recruiter identities, opportunity history, user corrections, source provenance, SQLite integrity, disk/CPU/memory availability, and logs.
- **Untrusted sources:** selected filenames, MBOX envelope lines, RFC 5322 headers, MIME structure, character encodings, HTML, text, attachment metadata/content, message IDs, and stored prompt-like text.
- **Boundaries:** browser-to-local Route Handler upload, controlled staging directory, bounded MBOX framer, MIME parser, normalizer, repository transaction, UI, logs, and export.
- **Dangerous sinks:** local file writes, memory allocation, HTML rendering, SQLite writes, logs/errors, and future consumers of stored message text.

### Threats and controls

| Threat | Reachable impact | Planned control | Failure behavior |
| --- | --- | --- | --- |
| Malformed MBOX separators | Wrong message boundaries or lost progress | Byte-oriented framer, validated envelope lines, offsets recorded before parsing | Mark source message failed; continue from the next valid boundary |
| Malformed MIME boundaries/headers | Parser loops, excessive allocation, incorrect fields | Pre-scan limits plus `postal-mime` nesting/header caps; per-message timeout | Redacted recoverable error; continue |
| Path traversal | Write outside project staging | Ignore client filenames for paths; random server ID; resolve and verify containment; store sanitized basename only | Reject request and delete partial staging file |
| Archive bomb/decompression | Disk/CPU exhaustion | M1 rejects archive extensions and ZIP/GZIP/TAR magic bytes; no decompressor exists | Terminal `unsupported_archive` before parsing |
| Oversized source/message/attachment | Disk, RAM, or CPU exhaustion | Enforce byte counters before and during upload/framing/parsing | Source rejection or per-message skip with counts |
| HTML/script content | Script execution or unsafe display | Never render or persist source HTML; convert bounded HTML to plain text with scripts/styles skipped | Store safe text or no body excerpt |
| Encoded headers/unusual charsets | Crashes or identity corruption | Standards parser; Unicode normalization; replacement characters recorded as warning | Preserve source hash and require review when identity fields are uncertain |
| Formula injection | Code execution when tabular data is opened | M1 adds no CSV export; JSON treats content as data. Any later CSV must neutralize leading `=`, `+`, `-`, `@`, tab, and carriage return | Reject unsafe serializer in tests |
| Prompt injection in messages | Future model/tool manipulation | Mark all imported content untrusted; no AI or external calls; never interpolate content into instructions/logs | Content remains inert local data |
| Duplicate/conflicting messages | Duplicate events or silent overwrite | Exact raw hash and canonical hash; Message-ID is supporting evidence, never sole overwrite key | Skip exact duplicates; quarantine same-ID/different-hash conflicts for review |
| Resource exhaustion | Unresponsive local app | Bounded chunks, one controlled writer, time/work budgets, abort signal, backpressure | Pause at checkpoint and report recoverable limit |
| Sensitive logging | Mail content leaked to console/error files | Structured error codes and IDs only; no subjects, addresses, bodies, headers, paths, or attachment names | Redaction test fails the build |
| Interrupted import | Partial or duplicated records | Commit each short batch with checkpoint in the same transaction | Resume from committed offset; discard uncommitted work |
| Reprocessing | User corrections disappear | Imported facts create/source-link records; never update/delete review decisions; accepted/rejected corrections outrank regenerated proposals | Preserve review history and surface conflicts |

## 2. Import limits

Limits are centralized in `src/ingestion/import-limits.ts`, covered by tests, displayed before import, and enforced on actual bytes rather than declarations alone.

| Limit | M1 value | Limit behavior |
| --- | ---: | --- |
| Selected MBOX size | 2 GiB | Reject before upload when known; abort and delete partial file if stream exceeds it |
| Compressed archive size | 0 bytes accepted | Reject ZIP/TAR/TGZ/GZIP by extension and magic bytes; no decompression |
| Raw message size | 25 MiB | Stop buffering that message, scan to next boundary, record failed |
| Decoded attachment | 10 MiB each | Do not retain content; record oversized metadata and warning |
| Aggregate decoded attachments | 20 MiB/message | Stop attachment handling and fail the message safely |
| Header count | 500/message | Fail that message before normalization |
| Header line length | 16 KiB | Fail that message; tolerate common non-conforming historical mail below this ceiling |
| Aggregate headers | 256 KiB | Pass `maxHeadersSize` and enforce independently |
| MIME nesting | 20 levels | Pass `maxNestingDepth: 20`; fail/quarantine overflow |
| Nested `message/rfc822` | 3 levels | Pass `maxRfc822NestingDepth: 3`; inventory deeper parts as attachments |
| Extracted safe text | 1 MiB/message | Truncate deterministically, set `text_truncated`, preserve hashes |
| Stored excerpt | 16 KiB/message | Truncate at a Unicode boundary; no source HTML stored |
| Batch work | 100 messages, 100 MiB input, or 30 seconds | Commit at the first reached limit, checkpoint, then schedule the next local batch |
| Per-message processing | 5 seconds | Abort that message, record timeout, continue |
| Recoverable staging retention | 24 hours | Purge expired staged sources at startup and before each import |

A limit never silently drops data: the preview/history counters show failed or skipped records with a redacted reason code. Source-wide failures are terminal; message-specific failures continue after a safe boundary. A batch budget pauses and resumes automatically from its checkpoint.

## 3. Parsing architecture

### Data flow

1. **Select and preflight:** Browser checks file extension and size, states that Gmail is unchanged, and requests an import ID.
2. **Stage safely:** `POST /api/imports/[importId]/source` streams bytes with backpressure to `.local/imports/<server-id>/source.mbox`. The server ignores the client filename for paths, creates files with mode `0600`, verifies path containment, hashes while writing, enforces size, and atomically renames only a complete upload.
3. **Preview:** Read only a bounded sample and source metadata. Show estimated/discovered counts, limits, duplicates found so far, and storage behavior; do not persist domain events until confirmation.
4. **Frame MBOX:** A small Node `Transform` scans byte chunks for valid `From ` separators without loading the mailbox. It records byte offset/length and enforces the message limit while preserving backpressure. It handles mboxrd `>From ` escaping inside bodies without treating it as a separator.
5. **Pre-scan:** Count header lines/bytes, reject overlong lines, and inspect MIME boundary depth before parser invocation.
6. **Parse MIME:** Send one bounded message to a single Node Worker running `postal-mime`, using explicit depth/header options and `resourceLimits`. Terminate/recreate the worker after five seconds so malformed parser work is actually stopped. Normalize folded/encoded headers, addresses, date, subject, Message-ID, references, and recipients.
7. **Extract safe text:** Prefer `text/plain`. For HTML-only mail, use `html-to-text` with script/style/head/iframe/form content skipped, URL/image handling disabled, bounded depth/input/output, and no DOM execution. Normalize Unicode and line endings. Quoted-history/signature removal produces a derived excerpt only; original source hash and offsets remain immutable.
8. **Inventory attachments:** Record sanitized basename, MIME type, disposition, declared/decoded size, content ID, and SHA-256 only while within limits. Never execute, render, persist, or automatically extract attachment bytes.
9. **Hash and deduplicate:** Compute raw SHA-256 over framed RFC 822 bytes and canonical SHA-256 over normalized stable headers plus normalized safe text. Normalize Message-ID by trimming surrounding whitespace/brackets and case-folding the domain only.
10. **Persist in layers:** Insert raw-source metadata, then existing `source_references`, then normalized `communication_events`; later deterministic product-event extraction writes evidence assertions/submissions with provenance. Parsing never opens a database transaction.
11. **Checkpoint:** Commit at most one bounded batch, including counts and next byte offset, then release the writer before continuing.

### Separation of records

- **Raw source record:** `import_source_messages` stores source offsets, immutable hashes, normalized Message-ID, status, and redacted error code—not raw body bytes.
- **Normalized message:** existing `communication_events` stores normalized direction/time/subject and a safe bounded excerpt linked to `source_references`.
- **Product event:** existing `evidence_assertions` and `submissions` store derived claims with confidence/review state and source links.
- **Staged source:** the original MBOX is temporary local input, not application history. It is deleted after completion or explicit deletion.

### Normalization rules

- Addresses use parser output, trimmed local/domain values, IDNA-normalized lowercase domain, and conservative local-part preservation.
- Dates become UTC ISO timestamps only when valid; invalid/ambiguous dates remain unknown and carry a warning.
- Subjects are Unicode-normalized, control characters removed, whitespace collapsed, and length bounded.
- Missing Message-ID uses canonical hash for deduplication. Repeated Message-ID plus identical canonical hash is duplicate; repeated Message-ID plus different hash is conflict, never overwrite.
- Quoted-history/signature detection is conservative and deterministic. Removed ranges affect only the derived excerpt; provenance always points to the immutable source record.

## 4. Persistence and recovery

### Transaction model

- Reuse the existing Node-compatible Drizzle/`better-sqlite3` boundary and startup checks.
- One in-process import coordinator owns writes. Each persistence call uses `BEGIN IMMEDIATE`, inserts no more than the batch limits, writes counters/checkpoint in the same transaction, and commits quickly.
- Reuse bounded `SQLITE_BUSY` exponential retries with jitter. After exhaustion, mark the batch paused with `database_busy`; do not lose the last committed checkpoint.
- Never keep a database transaction open while reading, parsing, hashing, converting HTML, or waiting on UI/network work.

### Idempotency and duplicates

- New `historical_imports` records are unique by owner/source fingerprint. Selecting the same unchanged file reopens completed history or resumes an incomplete import instead of creating another.
- `import_source_messages` is unique by owner/raw hash. Canonical hash adds cross-envelope duplicate detection.
- Existing unique owner/source-reference and owner/source-event constraints remain the final duplicate barrier.
- Duplicate rows increment `duplicate_count`; they do not update existing normalized events or assertions.
- Conflicting Message-ID records receive `conflict` status and enter review; neither record is silently discarded.

### Checkpoint and lifecycle

- Checkpoint fields include committed byte offset, framed-message ordinal, counters, source fingerprint, and update time.
- Startup converts stale `processing` batches to `paused_interrupted`; resume verifies staged-file size and SHA-256 before seeking to the committed offset.
- Cancellation uses an `AbortController`, finishes or rolls back only the current message batch, writes `paused_user`, and retains the stage for 24 hours. Resume continues from the committed offset.
- Completion deletes the staged MBOX immediately. Terminal source errors delete partial/staged content. Explicit “Delete import” deletes staged content immediately and removes import metadata only through a guarded owner-scoped transaction; already imported records require the existing owner-data deletion design in a later approved milestone.
- Re-import/reprocessing never mutates or deletes `review_decisions`. User-confirmed or corrected facts remain authoritative; new conflicting proposals are linked and returned to review.

## 5. Privacy rules

- Commit only small synthetic `.mbox`/`.eml` fixtures using `.example` identities and obviously fictional content.
- Keep `.local/imports/`, MBOX, EML, archives, databases, WAL/SHM files, backups, exports, and test artifacts ignored.
- Never use a real Takeout archive, real message body, OAuth token, recruiter record, or production-like fixture in tests, screenshots, logs, telemetry, an LLM, or a third party.
- No external network calls occur during upload, parsing, normalization, persistence, testing, or error reporting.
- Logs contain import IDs, ordinals, counts, durations, and stable error codes only. They exclude source paths, filenames, addresses, subjects, headers, bodies, excerpts, attachment names, and hashes that could become correlators.
- Attachment bytes exist only inside the bounded current-message buffer and are discarded after metadata/hash calculation; they are never written separately.
- Preview clearly states temporary local storage and retention. Completion deletes source bytes; paused imports expire after 24 hours; users can delete staged bytes immediately.

## 6. User experience

1. Add `/imports` with file selection, limits, privacy statement, and “This reads a local copy and does not alter Gmail.”
2. Accept `.mbox` only. Archive selection receives an immediate explanation to extract the Takeout archive locally.
3. Upload with byte progress and cancel. After staging, show preview before any domain records are written.
4. Preview shows source size, detected MBOX validity, sampled/discovered count, estimated duplicates, and applicable limits.
5. Confirm starts import. Progress reports `discovered`, `parsed`, `skipped`, `duplicated`, `failed`, and `imported` counts separately.
6. Recoverable errors (`database_busy`, malformed individual message, per-message limit, interrupted process) explain that committed records remain and offer resume.
7. Terminal errors (wrong format, source too large, changed/corrupt staged file) stop safely and require reselection.
8. Cancel pauses at a safe checkpoint; resume verifies the same staged source. Expiry or explicit deletion requires reselection.
9. Import history shows state, timestamps, counts, warnings, and redacted codes—never message content.
10. Completion links to recruiters/review queue and confirms that the temporary source copy was deleted and Gmail was not changed.

## 7. Test plan

All fixtures are synthetic and small. Generators create oversized declarations/structures without committing giant binaries.

### Unit tests

- Valid MBOX framing across arbitrary chunk boundaries and CRLF/LF input.
- Escaped `>From ` lines remain body content.
- Missing and duplicate Message-ID values; same-ID/same-hash duplicate; same-ID/different-hash conflict.
- RFC 2047 encoded headers, IDNA domains, unusual supported charsets, invalid dates, and bounded replacement behavior.
- Plain, multipart/alternative, nested multipart, quoted reply, and signature derivation.
- HTML-only content converts to inert text; script/style/form/iframe content and event attributes never survive.
- Prompt-injection text remains inert stored data and never reaches instructions, tools, logs, or network calls.
- Header count/line/aggregate limits, MIME-depth limit, extracted-text truncation, message timeout, and exact boundary behavior.
- Huge declared/decoded attachment, path-traversal filename, NUL/control filename, and aggregate attachment limit.
- ZIP/GZIP/TAR magic bytes and archive extensions are rejected before parsing.
- Formula-leading values remain inert in JSON; any future tabular serializer contract neutralizes them.
- Error serialization proves fixture body, subject, address, filename, source path, and header values are absent.

### Repository/integration tests

- Small valid synthetic Takeout-style MBOX imports into source references and normalized communication events.
- Repeat import produces zero duplicate source messages/events.
- Duplicate content across different MBOX files deduplicates by hash.
- Batch limits create checkpoints and resume at the exact next message.
- Injected interruption rolls back only the current transaction; resume matches uninterrupted output.
- Cancellation produces `paused_user`; resume completes; expired staging cleanup removes bytes.
- `SQLITE_BUSY` retries are bounded and transition to recoverable paused state.
- Conflicting recruiter identities stay separate/proposed for review; name alone never merges them.
- Existing review decisions and source evidence survive repeat import and deterministic reprocessing.
- Migration applies to a copied M0 database; backup and owner-data export include every new owner-data table.

### Browser tests

- Select, preview, confirm, progress, cancel, resume, history, recoverable error, terminal error, and completion flows.
- Keyboard, focus, live-region announcements, 320px layout, 200% zoom, text spacing, reduced motion, and forced colors.
- UI always states Gmail is unchanged and never exposes message bodies in errors.

### Compatibility gates

Run frozen install, migration, seed, `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:export`, `bun run build`, `bun run test:e2e`, and verified backup under Bun 1.4.0 with Node 24.20.0 and 26.4.0 CI jobs.

## 8. Dependency decision and compatibility evidence

No dependency is installed during planning. Re-verify exact versions, licenses, provenance, advisories, and lockfile changes immediately before implementation.

### Proposed

| Dependency | Why necessary | Evidence checked 2026-09-03 | Compatibility |
| --- | --- | --- | --- |
| `postal-mime@3.0.0` | Parse MIME, encoded words/addresses, multipart bodies, charsets, and attachment metadata without writing a parser | npm latest metadata: typed ESM/CJS exports, MIT-0, zero runtime dependencies, npm provenance; repository active 2026-08-11; exposes `maxNestingDepth`, `maxHeadersSize`, and `maxRfc822NestingDepth` | Accepts Buffer/Uint8Array/stream inputs; published TypeScript declarations; package built/tested on Node 24; suitable for Node 24/26 and Bun-installed npm packages. Must be exercised by project CI |
| `html-to-text@10.0.1` | Convert bounded HTML-only mail to plain text without rendering or executing it | npm latest metadata: ESM/CJS exports, MIT, Node `>=20.19.0`; repository active 2026-08-19 | Covers Node 24/26, strict TypeScript consumption, Next server code, and Vitest. Bun is only package manager/script runner. Must be configured to skip active/non-content elements and output limits |

Bun’s official package-manager documentation states `bun install` is an npm-compatible package manager usable with existing Node projects. This project continues to run application code on Node-compatible APIs; dependency runtime behavior must pass both Node CI versions.

### Compared but not selected

| Candidate | Finding | Decision |
| --- | --- | --- |
| `mailparser@3.9.20` | Active 2026-09-01, MIT, Node 24-published, streaming API, mature charset/MIME handling; but brings 10 direct runtime dependencies including Nodemailer and HTML conversion | Do not select initially; broader supply-chain surface than needed. Reconsider only if PostalMime fails the adversarial corpus or bounded behavior |
| `mbox-reader@1.2.0` | Async streaming API and active repository push in 2026; MIT; depends on `libmime` | Do not select: JavaScript-only, buffers each complete message, lacks explicit per-message/header limits, and does not support mboxcl2. A small bounded Node Transform gives tighter limit/checkpoint control |
| `node-mbox@2.0.0` | Node `>=14`, MIT, one runtime dependency | Do not select: npm release metadata dates to 2023 and it offers less current maintenance/limit evidence than `mbox-reader` |
| Custom MIME parser | Could avoid dependencies | Reject: MIME, encoded headers, charsets, and nested multipart are too complex and security-sensitive to reimplement |

## 9. Schema and migration plan

Create immutable additive migration `drizzle/0001_safe_historical_import.sql`; never edit `0000_m0.sql`. Update `src/db/schema.ts` in lockstep.

### Create `historical_imports`

Leave the M0 `import_batches` table and its status CHECK unchanged. Add a dedicated table with:

- `id`, `owner_id`, `source_fingerprint`, `original_name_display`, `source_size_bytes`, and `staged_expires_at`.
- `status` constrained to `uploading`, `preview_ready`, `processing`, `paused_user`, `paused_interrupted`, `completed`, `failed`, or `cancelled`.
- `discovered_count`, `parsed_count`, `skipped_count`, `duplicate_count`, `failed_count`, and `imported_count` with non-negative defaults.
- `last_error_code`, `created_at`, `started_at`, `updated_at`, and `completed_at`; errors are redacted codes only.
- Unique `(owner_id, source_fingerprint)` plus owner/status/time indexes.

### Create `import_checkpoints`

- Columns: `id`, `owner_id`, `historical_import_id`, `source_fingerprint`, `committed_byte_offset`, `message_ordinal`, six counters, `created_at`, `updated_at`.
- Constraints: non-negative offsets/counters; unique `historical_import_id`; owner-scoped foreign keys and index.
- The checkpoint update and imported rows commit in one transaction.

### Create `import_source_messages`

- Columns: `id`, `owner_id`, `historical_import_id`, nullable `source_reference_id`, `message_ordinal`, `byte_offset`, `byte_length`, `raw_sha256`, `canonical_sha256`, `normalized_message_id`, `parse_status`, `warning_codes_json`, `error_code`, `created_at`.
- No raw body, raw headers, source path, or attachment bytes.
- Constraints/indexes: unique `(owner_id, raw_sha256)`; indexes on `(owner_id, canonical_sha256)`, `(owner_id, normalized_message_id)`, batch/ordinal, and status; non-negative offsets/lengths.
- Same Message-ID/different canonical hash is represented as conflict, not blocked by uniqueness.

### Create `attachment_inventory`

- Columns: `id`, `owner_id`, `source_message_id`, `ordinal`, `safe_filename`, `mime_type`, `disposition`, `content_id`, `decoded_size_bytes`, `content_sha256`, `oversized`, `created_at`.
- No attachment bytes or extracted files.
- Unique `(source_message_id, ordinal)` and owner/source indexes.

### Create `import_errors`

- Columns: `id`, `owner_id`, `historical_import_id`, nullable `source_message_id`, `stage`, `code`, `recoverable`, `message_ordinal`, `created_at`.
- Error codes and stages are allowlisted; no arbitrary parser messages or source content are stored.
- Index by owner/batch/time.

### Existing-table behavior

- Keep `source_references` as immutable provenance visible to the product; metadata stores only allowlisted normalized fields and source-message IDs.
- Keep `communication_events` as normalized messages; import inserts use source-reference uniqueness and never overwrite user-edited/product history.
- Keep `evidence_assertions`, `submissions`, and `review_decisions` append-only/linked. Reprocessing adds a new proposed assertion when needed; it never rewrites a decision.
- Extend owner-data export allowlist and deletion ordering for all four new tables. Update backup/export tests before migration is accepted.

### Rollback and recovery

- **Before release:** restore the verified pre-migration backup if migration application fails; never edit or down-migrate a user database in place.
- **After release:** forward-fix with a new migration. New nullable/defaulted columns and tables leave M0 reads intact.
- **Interrupted migration:** Drizzle migration transaction must leave either the old schema or complete new schema; verify with copied-database tests and `foreign_key_check`.
- **Interrupted import:** resume only from the last committed checkpoint after fingerprint verification; otherwise fail closed and require reselection.
- **Rollback feature code:** old M0 code ignores additive tables/columns; staged files can be purged independently without touching imported records.

## 10. Exact implementation sequence and files

1. **Freeze contracts and limits**
   - Create `src/domain/imports.ts` for states, counters, transitions, limit/result types.
   - Create `src/ingestion/import-limits.ts` for centralized constants.
   - Create `tests/ingestion/import-limits.test.ts`.
2. **Add immutable persistence**
   - Change `src/db/schema.ts`.
   - Create `drizzle/0001_safe_historical_import.sql` and generated metadata.
   - Change `src/domain/repositories.ts` and `src/db/repositories.ts` for import history/checkpoints.
   - Change `src/db/export.ts`, `scripts/export-check.ts`, and backup/export tests.
   - Create `tests/db/import-migration.test.ts` and `tests/db/import-repositories.test.ts`.
3. **Build bounded source intake**
   - Create `src/ingestion/staging.ts`, `source-preflight.ts`, and `mbox-framer.ts` using Node streams/path/crypto only.
   - Create `tests/ingestion/staging.test.ts`, `source-preflight.test.ts`, and `mbox-framer.test.ts`.
   - Update `.gitignore` for staging and raw mail patterns if any gap is found.
4. **Add MIME and safe-text normalization**
   - Add pinned `postal-mime` and `html-to-text` to `package.json`/`bun.lock` only after approval and re-verification.
   - Create `src/ingestion/mime-parser.ts`, `mime-worker.ts`, `safe-text.ts`, `message-normalizer.ts`, and `deduplication.ts`; the worker is the enforceable CPU/heap/time boundary.
   - Add focused adversarial unit tests and synthetic fixtures under `src/test/fixtures/mbox/` and `src/test/fixtures/messages/`.
5. **Add short-batch coordinator**
   - Create `src/application/imports/create-import.ts`, `preview-import.ts`, `process-import-batch.ts`, `cancel-import.ts`, `resume-import.ts`, `get-import-history.ts`, and `delete-import.ts`.
   - Create `src/db/import-coordinator.ts` with one controlled writer, busy retries, and same-transaction checkpoints.
   - Add interruption, cancellation, resume, duplicate, conflict, and busy integration tests.
6. **Add local UI/API**
   - Create `src/app/imports/page.tsx` and small neighboring components matching the existing design.
   - Create Route Handlers under `src/app/api/imports/` for create, bounded source upload, preview, process/status, cancel/resume, and delete.
   - Update `src/components/app-shell.tsx` with the Imports navigation entry.
   - Add accessible progress/error/history states and `tests/e2e/import-mbox.spec.ts`.
7. **Close documentation and operations**
   - Update `README.md`, `docs/PRODUCT_BRIEF.md`, `ROADMAP.md`, and `docs/adr/0001-m0-runtime-and-storage.md` only where status/cross-links change.
   - Create a new ADR for M1 parser/dependency/staging decisions rather than rewriting ADR 0001.
   - Run full Node 24/26 CI, migration-on-M0-copy, seed, export, backup, unit/component, build, browser, accessibility, and privacy-log gates.

## 11. Measurable M1 acceptance criteria

1. A small valid synthetic Takeout-style MBOX imports expected normalized messages and provenance with zero external network calls.
2. Re-importing the same unchanged MBOX imports zero additional source messages, communication events, assertions, or submissions.
3. Duplicate raw/canonical messages across separate batches are counted and not duplicated; same-ID/different-content records are preserved as conflicts.
4. Parsing never buffers more than one bounded 25 MiB message plus fixed stream overhead; source reading uses backpressure.
5. Every declared limit has boundary, over-limit, and redacted-error tests.
6. ZIP/GZIP/TAR inputs are rejected before decompression or entry handling; no archive dependency or decompression path exists.
7. HTML/script fixtures produce inert plain text only; raw HTML and attachment bytes are never persisted or rendered.
8. Missing/encoded/duplicate headers, unusual charsets, malformed MIME, quoted replies, deep nesting, traversal filenames, oversized attachments, and prompt-like text fail or normalize exactly as documented.
9. An interrupted 100-message import resumes from the last committed byte offset and produces byte-for-byte equivalent exported owner data to uninterrupted import, excluding timestamps/IDs explicitly documented as variable.
10. Cancellation pauses within one current message/batch, preserves committed data, resumes within 24 hours, and deletes staged bytes on completion, expiry, terminal failure, or explicit deletion.
11. Database lock contention uses bounded retries; exhaustion produces recoverable `database_busy` without duplicate or partial committed records.
12. Review decisions remain append-only and revision guarded; accepted corrections and source evidence survive repeat import and reprocessing.
13. Import progress/history reports discovered, parsed, skipped, duplicated, failed, and imported separately, without displaying or logging message content.
14. Owner-data export includes every new owner-data table; verified backup and `foreign_key_check` pass after migration/import.
15. Only synthetic `.example` fixtures are tracked. Secret/personal-data scans find no mailbox archives, tokens, databases, backups, exports, or real recruiter data.
16. The import UI states before and after processing that it reads a local copy and does not alter Gmail.
17. Frozen install, Biome, strict TypeScript, Vitest, export, production build, Playwright, migration, seed, and backup gates pass on Node 24.20.0 and 26.4.0 using Bun 1.4.0 as package manager/runner.
18. VoiceOver/Safari remains a documented manual-verification item unless it is explicitly tested before M1 release.

## Evidence sources

- PostalMime repository and declarations: <https://github.com/postalsys/postal-mime>
- PostalMime npm metadata: <https://registry.npmjs.org/postal-mime/latest>
- MailParser official docs: <https://nodemailer.com/extras/mailparser>
- MailParser npm metadata: <https://registry.npmjs.org/mailparser/latest>
- MboxReader repository: <https://github.com/postalsys/mbox-reader>
- MboxReader npm metadata: <https://registry.npmjs.org/mbox-reader/latest>
- html-to-text repository: <https://github.com/html-to-text/node-html-to-text>
- html-to-text npm metadata: <https://registry.npmjs.org/html-to-text/latest>
- Bun package-manager documentation: <https://bun.com/docs/pm/cli/install>
