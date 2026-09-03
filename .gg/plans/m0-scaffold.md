# DontGhostMe M0 scaffold plan

**Status:** proposed; implementation requires explicit approval  
**Version/research snapshot:** 2026-09-02  
**Scope:** M0 synthetic vertical slice only

## Repository and environment findings

- The repository is pre-scaffold: no `package.json`, lockfile, TypeScript, Next.js, database, test, or CI configuration exists.
- Branch is `main`, tracking `origin/main`.
- Existing work is not ours and will remain unstaged/uncommitted: modified `AGENTS.md`, `CLAUDE.md`, and `ROADMAP.md`; untracked `.gg/commands/scaffold.md` and `docs/assets/dontghostme-readme-hero.png`.
- Existing tracked README, license, product/research documents, and README artwork remain intact. README changes will only append development instructions.
- Locally installed Node directories are `20.20.0`, `22.21.1`, `24.8.0`, and `26.4.0`. Bun is installed, but plan-mode command restrictions prevented executing its local version probe. Implementation starts with non-mutating version checks and stops on a material mismatch.

## Exact stack proposal

| Tool | Exact version | Role / compatibility target |
|---|---:|---|
| Bun | `1.4.0` | Package manager and command runner; `packageManager: bun@1.4.0`; CI pinned exactly |
| Node.js | primary `24.20.0`, compatibility `26.4.0` | Application runtime matrix; package engine `>=24.20.0 <27`; `.nvmrc` uses LTS `24.20.0` |
| Next.js | `16.3.4` | App Router; Node runtime only |
| React / React DOM | `19.2.8` | Version pair accepted by Next `16.3.4` |
| TypeScript | `7.0.2` | Strict mode; `tsc --noEmit` is independent from Next build |
| Biome | `2.5.11` | Format, import organization, lint, CSS checks |
| Drizzle ORM | `0.45.2` | Typed persistence adapter only; domain remains independent |
| Drizzle Kit | `0.31.10` | Generate reviewable SQL migrations |
| better-sqlite3 | `13.0.3` | Selected Node SQLite driver; bundles SQLite `3.53.4` |
| Vitest | `4.1.0` | Domain, ingestion, database, and component tests |
| React Testing Library | `16.3.3` | Component behavior and semantics |
| Playwright | `1.58.2` | Chromium vertical-slice test |

All package versions will be exact, without caret or tilde ranges. Only `bun.lock` will be committed.

## SQLite-driver decision

### Recommendation: `better-sqlite3@13.0.3`

- **Compatibility:** Node `>=22`; shipped platform prebuilds; Next server code can load it only in the Node runtime; Drizzle has a dedicated adapter.
- **Durability/runtime:** bundled SQLite is `3.53.4`, exceeding the required fixed floor `3.51.3`; startup still verifies the actual runtime instead of trusting package metadata.
- **Features:** synchronous short transactions suit a local single-writer application; exposes PRAGMA results, transactions, online backup, and FTS5-enabled builds.
- **Bun boundary:** Bun installs dependencies and launches scripts; Next, Vitest, Drizzle scripts, and Playwright execute as Node-compatible programs. No `bun:sqlite`, `Bun.serve`, or `bun --bun` path enters application code.
- **Cost:** one native dependency. Prebuild availability is checked on both Node versions in CI; unsupported platforms fail clearly instead of silently changing drivers.

### Alternatives evaluated

| Driver | Evidence | Decision |
|---|---|---|
| `node:sqlite` | Node `24.20.0` bundles SQLite `3.53.4`, Drizzle supports it, and it removes a dependency; Node still labels the API stability `1.2` (release candidate). | Defer until the API is stable; reconsider by ADR rather than silently swapping. |
| local libSQL (`@libsql/client@0.17.3`) | Drizzle-supported and can use a local file, but adds a client/fork layer aimed at local-replica/remote workflows. | Reject for M0: no remote database requirement, less direct control over the exact SQLite/backup contract, more moving parts. |
| `bun:sqlite` | Fast and integrated with Bun. | Explicitly excluded: it would couple core persistence to the Bun runtime. |

### Verified sources

- Bun `1.4.0`: official Bun GitHub release API and Bun installation/run documentation.
- Node `24.20.0`: official Node distribution index; `node:sqlite` docs and bundled `sqlite3.h` report SQLite `3.53.4`.
- Next `16.3.4` package metadata: Node `>=20.9.0`, React `^19` supported.
- `better-sqlite3@13.0.3`: package metadata requires Node `>=22`; source pins SQLite `3530400` (`3.53.4`); API documents PRAGMA, immediate transactions, and online backup.
- SQLite change log: the WAL-reset corruption fix is present from `3.51.3`; SQLite PRAGMA/WAL/backup docs define the operating behavior.
- Biome `2.5.11` domain/rule docs include Next, React, Playwright, and Drizzle-aware rules.

## Architecture and dependency direction

```text
Next routes + accessible components
              |
              v
Feature/application use cases --------> pure domain models + repository ports
              ^                                      ^
              |                                      |
     composition root                       synthetic normalizer
              |
              v
Drizzle repository adapters ---------> better-sqlite3 connection/startup
              |
              v
versioned reviewed SQL migrations + local SQLite file
```

Rules:

- `src/domain/**` imports no Next, React, Drizzle, SQLite, filesystem, or fixture modules.
- Use cases accept repository ports and clocks/ID generators; infrastructure is supplied at the composition root.
- `src/ingestion/**` accepts the typed synthetic source format, produces domain write models, and performs no SQL.
- `src/db/**` owns Drizzle schema, startup verification, transactions, retries, and adapters.
- Server Components query use cases directly. The review form uses one Server Action; no browser database access exists.
- Database modules import `server-only`; routes that touch SQLite declare the Node runtime.
- No service, connector, auth, Gmail, LinkedIn, AI, analytics, telemetry, or outbound communication layer is created.

## Design direction

**Surface:** application UI with a data-dense recruiter timeline.  
**Audience:** a job seeker auditing history under moderate uncertainty.  
**Primary job:** understand what happened, inspect evidence, and correct an uncertain fact.  
**Risk:** false certainty or destructive correction is worse than visual density.

Design thesis:

- Use the established royal-purple, gold, crimson, and acidic-green pulp-noir identity as restrained framing, not as status meaning.
- Use a readable body face and a distinctive dossier/typewriter display face through `next/font`; avoid generic system typography while limiting weights and layout shift.
- The product-specific signature is a crimson evidence thread connecting chronological events to expandable source excerpts.
- Use flat, opaque dossier surfaces, square/trimmed geometry, shared content rails, strong separators, and no glass, generic bento grid, hover lift, emoji, or ambient motion.
- Status always has text and shape, never color alone. Confidence is shown as text plus a native meter where useful.
- Navigation remains ordinary links with `aria-current`; no custom mobile menu is needed for six short destinations.
- Timeline uses an ordered list, `<time>`, meaningful headings, and native `<details>` evidence disclosure.
- Review actions use explicit `Confirm fact` and `Reject fact` buttons, pending feedback, conflict recovery, and an announced result. Rejection preserves the source and assertion.
- Scope for accessibility verification: all six routes, navigation, evidence disclosure, export, and confirm/reject flow at desktop and 320 CSS pixels; keyboard, visible focus, 200% text, reduced motion, forced colors, axe, and representative VoiceOver/Safari remain required evidence. No compliance claim will be made from automation alone.

Surface value:

- **Home:** synthetic-mode notice, Jane summary, sourced metric ledger, and direct path to her timeline.
- **Recruiters:** one real fixture row with identity count, affiliation span, last contact, and unresolved work.
- **Recruiter Detail:** complete chronology, two distinct opportunities, identity/affiliation history, evidence excerpts, confidence, and review state.
- **Opportunities:** two separate records with explicit-submission and unknown-outcome distinctions.
- **Review Queue:** the proposed new-employer affiliation, evidence, confidence, and working confirm/reject flow.
- **Data & Privacy:** local/synthetic data inventory, no-network statement, provenance counts, database location category (not an absolute path), and portable JSON download.

## Initial relational schema

All IDs are application-generated text UUIDs; seed IDs are fixed UUIDs for deterministic replay. All timestamps are UTC ISO-8601 text. Every table has `owner_id`; every adapter method requires it. M0 uses one fixed synthetic owner, while PostgreSQL/RLS remains deferred.

### Core tables

- `owners`: `id` PK, `display_name`, `created_at`.
- `recruiters`: `id` PK, `owner_id` FK `RESTRICT`, `canonical_name`, `created_at`; index `(owner_id, canonical_name)`.
- `recruiter_identities`: `id` PK, `owner_id`, `recruiter_id` FK `CASCADE`, normalized/display email, `valid_from`, nullable `valid_to`, `created_at`; unique `(owner_id, normalized_email)` and range-order check.
- `organizations`: `id` PK, `owner_id`, display/normalized name, `created_at`; index `(owner_id, normalized_name)`.
- `recruiter_affiliations`: `id` PK, `owner_id`, recruiter/org FKs `RESTRICT`, `valid_from`, nullable `valid_to`, `created_at`; unique `(owner_id, recruiter_id, organization_id, valid_from)` and range-order check.
- `opportunities`: `id` PK, `owner_id`, `recruiter_id` FK `RESTRICT`, staffing organization FK `RESTRICT`, nullable end-client organization FK `SET NULL`, title, external/source key, `introduced_at`, `created_at`; unique `(owner_id, source_key)`, indexes by recruiter/date and owner/date.
- `submissions`: `id` PK, `owner_id`, opportunity/recruiter FKs `RESTRICT`, `submitted_at`, `created_at`; unique `(owner_id, opportunity_id)` for the M0 single explicit submission model.
- `conversations`: `id` PK, `owner_id`, recruiter FK `RESTRICT`, stable thread key, subject, `started_at`, `created_at`; unique `(owner_id, thread_key)`.
- `conversation_opportunities`: owner plus conversation/opportunity FKs, composite PK; preserves separate concepts and permits future many-to-many history.

### Source, timeline, and review tables

- `source_references`: `id` PK, `owner_id`, source kind/key, synthetic plain-text content, content SHA-256, occurred/captured timestamps; unique `(owner_id, source_kind, source_key)` and `(owner_id, content_sha256, source_key)`.
- `communication_events`: `id` PK, `owner_id`, conversation/source/recruiter-identity FKs, direction check (`recruiter_to_candidate` or `candidate_to_recruiter`), occurred timestamp; source reference unique; timeline index `(owner_id, conversation_id, occurred_at, id)`.
- `evidence_assertions`: `id` PK, `owner_id`, source FK, nullable typed entity FKs, fact type, canonical JSON value, minimal supporting excerpt, confidence basis points with `0..10000` check, inference flag, review requirement (`none` or `user_review`), occurred/created timestamps; check that at least one typed entity FK is present; indexes by source, fact type, recruiter, opportunity, and review requirement.
- `review_decisions`: `id` PK, `owner_id`, assertion FK `RESTRICT`, monotonically increasing revision, decision check (`confirmed`, `rejected`, `corrected`), nullable corrected JSON, created timestamp; unique `(owner_id, assertion_id, revision)` and a check requiring corrected content only for `corrected`.
- `import_batches`: stable batch ID/key, owner, source-set hash, status, checkpoint source key, processed count, started/completed timestamps; unique `(owner_id, batch_key)` supports idempotent resume.

The latest review state is derived from the latest append-only decision; an assertion requiring review with no decision is `proposed`, while a no-review assertion is `accepted`. Source content and assertions are immutable. Corrections append decisions and never rewrite evidence.

## Synthetic Jane fixture and expected derivation

Nine plain-text `.example` messages encode the required sequence:

1. Jane at `jane@oldagency.example` introduces opportunity A.
2. Candidate replies.
3. Jane requests a synthetic resume.
4. Candidate replies with the synthetic resume acknowledgment.
5. Jane requests right-to-represent.
6. Candidate confirms.
7. Jane explicitly states the candidate was submitted.
8. Jane follows up and requests an interview; no later source documents an outcome.
9. Months later Jane at `jane@newagency.example`, with a New Agency signature, introduces opportunity B.

Expected Jane metrics from queries, never stored counters:

- first contact: timestamp of message 1;
- last contact: timestamp of message 9;
- recruiter messages: `6`;
- candidate replies: `3`;
- inferred recruiter follow-ups: `1`;
- current unanswered side: `candidate`;
- opportunities: `2`;
- explicit submissions: `1`;
- unknown outcomes: `1`.

Identity linkage is not inferred by name alone: the fixture contains a stable synthetic source assertion linking both addresses to Jane. The new-company affiliation is the proposed fact shown in Review Queue, supported by its signature excerpt and confidence. Rejecting it removes the affiliation from the accepted view without deleting its source or assertion.

## SQLite operating contract

At every writable connection startup, code applies and reads back:

- `PRAGMA foreign_keys = ON`, requiring `1`;
- `PRAGMA journal_mode = WAL`, requiring `wal`;
- `PRAGMA busy_timeout = 5000`, requiring `5000` milliseconds;
- `PRAGMA synchronous = FULL`, requiring SQLite value `2`;
- `SELECT sqlite_version()`, requiring semantic version `>=3.51.3`;
- a temporary `fts5` virtual-table create/drop probe, failing closed if unavailable before any FTS-backed feature relies on it.

Operational rules:

- One module-scoped writable connection per process; local disk only, never a network filesystem.
- Parse/normalize and hash outside transactions. Persist fixed batches of at most `100` source messages in `BEGIN IMMEDIATE` transactions.
- Use source keys, hashes, stable IDs, unique constraints, and `import_batches` checkpoints so replay is idempotent and interruption resumes after the last committed source key.
- Retry only `SQLITE_BUSY` batch writes, outside the failed transaction, up to five attempts with bounded exponential delays (`25, 50, 100, 200, 400ms`). Other errors fail immediately. M0 seed is below one batch but exercises the same path.
- Review decisions use short `FULL`-durability transactions and optimistic revision uniqueness. A conflict returns a retryable UI message; no automatic duplicate decision is inserted.
- Keep SQLite's passive auto-checkpoint behavior. Do not issue `RESTART`/`TRUNCATE` checkpoints during normal requests; maintenance checkpoints require the fixed runtime, exclusive maintenance, and a verified backup.
- Generated migrations are reviewed SQL, committed from the first schema, forward-only, never edited after application, and tested against a fresh temporary database in CI. `drizzle-kit push` is not exposed.
- Before applying a migration to a non-synthetic database, run a dry-run inspection, create an online backup, migrate a copy, and verify foreign keys plus representative timeline/export output.
- `db:backup` uses the driver's online backup API to a timestamped ignored local path, then opens the copy read-only and runs `integrity_check`, `foreign_key_check`, and representative row counts. This proves file readability, not full disaster recovery.
- M0 contains only reproducible synthetic source data. Before real user data is admitted, automated off-device retention plus a timed restore drill and explicit RPO/RTO become release blockers.

## Direct dependencies and reasons

### Runtime

- `next@16.3.4`: App Router, Server Components, Server Actions, route handler, image/font handling.
- `react@19.2.8` and `react-dom@19.2.8`: supported rendering pair.
- `drizzle-orm@0.45.2`: typed SQLite adapter and checked query construction.
- `better-sqlite3@13.0.3`: selected Node SQLite runtime and online backup API.
- `server-only@0.0.1`: compile-time guard against importing database modules into client bundles.

### Development

- `typescript@7.0.2`: strict static checking.
- `@types/node@24.10.13`, `@types/react@19.2.14`, `@types/react-dom@19.2.3`, `@types/better-sqlite3@9.6.0`: compile-time contracts.
- `@biomejs/biome@2.5.11`: formatter/import organizer/linter.
- `drizzle-kit@0.31.10`: reviewable SQL migration generation.
- `tsx@4.23.13`: execute typed migration, seed, and backup scripts under Node.
- `vitest@4.1.0`: domain/application/database test runner.
- `jsdom@30.0.1`: component DOM environment.
- `@testing-library/react@16.3.3` and `@testing-library/jest-dom@7.0.1`: behavior-first component assertions.
- `@playwright/test@1.58.2`: browser vertical-slice test and managed web server.
- `@axe-core/playwright@4.13.0`: automated accessibility defect detection within Playwright; never treated as conformance proof.

No Tailwind, UI kit, icon library, state library, API client, validation library, Prettier, ESLint, auth, telemetry, or external service dependency is needed.

## Biome rule posture

Enable recommended rules and explicitly enable the relevant nursery/domain rules available in Biome `2.5.11`:

- Drizzle: `noDrizzleDeleteWithoutWhere`, `noDrizzleUpdateWithoutWhere`.
- Next: domain rules including `noDocumentImportInPage`, `noHeadElement`, `noHeadImportInDocument`, and `noImgElement`.
- React: `noComponentHookFactories`, `useReactAsyncServerFunction`, and standard hook correctness rules.
- Playwright: no conditional tests/expectations, duplicate hooks, element handles, evaluation in expect, focused/skipped tests, nested tests, raw locators, or unsupported matchers.

React Compiler is not enabled in M0, so compiler-specific enforcement is not applicable. Biome now covers the material Drizzle and Playwright gaps; no ESLint backstop is proposed. If implementation proves an exact missing correctness rule, work stops for approval before adding ESLint.

## Commands and CI gates

Package scripts:

```text
bun install
bun run dev                 # next dev
bun run check               # biome check .
bun run check:fix           # biome check --write .
bun run typecheck           # tsc --noEmit
bun run test                # vitest run
bun run test:e2e            # playwright test
bun run db:generate         # drizzle-kit generate
bun run db:migrate          # tsx scripts/db-migrate.ts
bun run db:seed             # tsx scripts/db-seed.ts
bun run db:backup           # tsx scripts/db-backup.ts
bun run build               # next build
```

CI uses least-privilege `contents: read`, immutable action SHAs, Bun `1.4.0`, `bun install --frozen-lockfile`, a temporary ignored database, and synthetic data only. The primary Node `24.20.0` job runs migration, seed, Biome, typecheck, Vitest, build, Playwright Chromium, and axe assertions. A Node `26.4.0` compatibility job repeats migration, seed, unit/component tests, and build. No CI secret is required.

## File-by-file implementation sequence

1. `package.json`, `bun.lock`, `.nvmrc`: exact engines, package manager, dependencies, and coherent scripts.
2. `.gitignore`, `.env.example`: append generated/local database, backup, Playwright, and safe optional path rules without weakening existing privacy exclusions.
3. `tsconfig.json`, `next-env.d.ts`, `next.config.ts`: strict App Router Node-compatible compiler/runtime setup.
4. `biome.json`, `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `drizzle.config.ts`: quality/test/database configuration with current verified flags.
5. `docs/adr/0001-m0-runtime-and-storage.md`: exact versions, better-sqlite3 decision, Bun/Node boundary, SQLite contract, and PostgreSQL trigger.
6. `DESIGN.md`: design read, thesis, tokens, component states, responsiveness, and accessibility verification scope.
7. `src/domain/models.ts`, `src/domain/repositories.ts`, `src/domain/metrics.ts`, `src/domain/reviews.ts`: pure contracts, ports, deterministic derivations, and correction semantics.
8. `src/test/fixtures/jane-conversation.ts`, `src/ingestion/synthetic-normalizer.ts`: nine-message source set, stable IDs/hashes, typed normalization, and no SQL.
9. `src/db/schema.ts`, `src/db/client.ts`, `src/db/startup.ts`, `src/db/repositories.ts`, `src/db/import-batches.ts`, `src/db/export.ts`: constraints, verified startup, scoped adapters, batching/retry, and portable export.
10. `drizzle/0000_m0.sql` plus Drizzle metadata: generated, manually reviewed first migration.
11. `scripts/db-migrate.ts`, `scripts/db-seed.ts`, `scripts/db-backup.ts`: explicit Node-run operational entry points.
12. `src/application/get-home.ts`, `src/application/get-recruiters.ts`, `src/application/get-recruiter-detail.ts`, `src/application/get-opportunities.ts`, `src/application/get-review-queue.ts`, `src/application/review-assertion.ts`, `src/application/export-data.ts`: use cases over ports.
13. `src/app/layout.tsx`, `src/app/globals.css`, `src/components/app-shell.tsx`, `src/components/evidence-timeline.tsx`, `src/components/metric-ledger.tsx`, `src/components/review-decision-form.tsx`: shared semantic shell and theme.
14. `src/app/page.tsx`, `src/app/recruiters/page.tsx`, `src/app/recruiters/[recruiterId]/page.tsx`, `src/app/opportunities/page.tsx`, `src/app/review-queue/page.tsx`, `src/app/data-privacy/page.tsx`, `src/app/api/export/route.ts`, `src/app/actions/review.ts`: complete six-surface flow, export, and correction action.
15. `tests/domain/metrics.test.ts`, `tests/ingestion/synthetic-normalizer.test.ts`, `tests/db/startup.test.ts`, `tests/db/repositories.test.ts`, `tests/components/review-decision-form.test.tsx`: rule, durability, provenance, correction, and component coverage.
16. `tests/e2e/jane-timeline.spec.ts`: complete Jane flow, deep-link/navigation, source disclosure, metrics, confirm/reject, narrow viewport, and axe checks.
17. `.github/workflows/ci.yml`: immutable action SHAs, frozen lockfile, runtime compatibility, migration/seed, all gates.
18. `README.md`: append prerequisites, exact supported versions, commands, synthetic-data notice, and architecture links while preserving all current explanation, boundaries, license text, and hero image.

## Risks, assumptions, deferrals, and rollback

- **Native addon risk:** CI proves `better-sqlite3` on supported Node/platform runners. If a supported target lacks a prebuild, stop and revisit the ADR; do not substitute a driver silently.
- **Bun version uncertainty:** local Bun could not be executed during plan mode. Implementation first verifies `1.4.0`; a mismatch is reported before install.
- **Next/TypeScript freshness:** versions are pinned from the 2026-09-02 official/package snapshot. Lockfile plus CI prevents unreviewed drift.
- **Single writer ceiling:** one local process owns writes. Multiple instances, workers, hosts, tenant isolation/RLS, hosted replication/PITR, pooling, or network access trigger PostgreSQL before launch.
- **Identity evidence:** fixture linkage is explicit; production identity resolution and merge/split UI are deferred.
- **No FTS table:** M0 verifies FTS5 capability but does not create search indexes. M1 introduces reviewed custom SQL and transactional synchronization only when search is used.
- **No hostile mailbox parser:** M0 accepts only compile-time synthetic plain-text fixtures. MIME/MBOX/archive/HTML/attachment defenses begin with M1 ingestion, not as unused scaffold code.
- **No real-data recovery claim:** the online backup check validates a synthetic copy. Automated off-device backups and a timed restore drill are deferred until real data is approved.
- **Visual evidence:** accessibility and layout remain unverified until rendered desktop/mobile, keyboard, axe, contrast, and VoiceOver checks run.
- **Rollback:** before any real data, remove the scaffold files and ignored local database to return to the documentation-only repository. After a migration is applied to valuable data, migrations are forward-only: restore a verified backup or add a corrective migration, never edit applied SQL.
- **Existing work:** implementation never stages, commits, pushes, rewrites, or discards the pre-existing modified/untracked files. It reports them separately at completion.

## M0 acceptance criteria

1. A clean checkout with Bun `1.4.0` and supported Node runs frozen install and every documented command without hosted services or secrets.
2. Only `bun.lock` exists; all direct dependencies are exact and license-compatible with AGPL-3.0 distribution.
3. Runtime startup fails closed unless SQLite is `>=3.51.3`, foreign keys are on, WAL is active, busy timeout is `5000`, synchronous is `FULL`, and FTS5 probe succeeds.
4. Fresh migration and idempotent seed produce one owner, one Jane recruiter, two email identities, two dated affiliations, two separate opportunities, one explicit submission, two conversations, and nine communications.
5. All extracted/inferred assertions expose source reference, minimal excerpt, confidence, inferred/direct status, and derived review state.
6. Jane's derived metrics equal `6` recruiter messages, `3` candidate replies, `1` follow-up, `2` opportunities, `1` explicit submission, and `1` unknown outcome; first/last timestamps and current unanswered side are correct.
7. Resume and right-to-represent requests never create submissions; names alone never merge identities; silence is labeled unknown, never ghosting.
8. Confirming or rejecting the proposed affiliation appends a decision, preserves source/assertion records, survives reload, and handles stale revision conflict without duplicate writes.
9. Home, Recruiters, Recruiter Detail, Opportunities, Review Queue, and Data & Privacy each expose useful fixture-backed content and work at 320px and desktop widths.
10. Portable JSON export contains normalized entities, evidence, hashes, and review history without SQLite-specific schema details or absolute local paths.
11. Vitest/RTL tests cover identity and opportunity separation, explicit submission, follow-up, unknown outcome, metrics, startup checks, idempotent replay, and correction preservation.
12. Playwright proves the full Jane path and reports no configured axe violations; manual keyboard, focus, 200% text, forced-colors, and VoiceOver findings are recorded without claiming formal conformance.
13. CI passes Biome, TypeScript, migration/seed, unit/component tests, production build, and the primary Playwright path on pinned versions.
14. README retains its current product explanation, boundaries, license, and hero image while documenting setup and commands.
15. `git status` shows implementation files plus the untouched pre-existing changes; nothing is committed or pushed.

## Steps

1. Verify local Bun and Node versions, preserve the recorded dirty worktree, and stop if the approved runtime cannot execute.
2. Create exact package/runtime metadata, install dependencies with Bun, and retain only `bun.lock`.
3. Add strict TypeScript, Next, Biome, Vitest, Playwright, Drizzle, and safe environment configuration.
4. Write the M0 runtime/storage ADR and product-specific design specification.
5. Implement pure domain contracts, repository ports, review semantics, and derived metric rules.
6. Add the deterministic nine-message Jane fixture and pure synthetic normalizer.
7. Define the constrained Drizzle schema and generate/review the first forward-only SQL migration.
8. Implement verified SQLite startup, owner-scoped adapters, idempotent batches, retries, export, and checked online backup.
9. Add migration, seed, and backup scripts using the shared SQLite operating contract.
10. Implement application use cases and the server-side composition root.
11. Build the shared accessible pulp-noir shell, evidence timeline, metrics, and review controls.
12. Build all six fixture-backed routes, the portable export route, and append-only review action.
13. Add unit, ingestion, database, component, accessibility, and full Jane Playwright tests.
14. Add pinned least-privilege CI for Node LTS/current compatibility and every approved gate.
15. Append development instructions to README without replacing existing content or imagery.
16. Run migration, seed, backup verification, Biome, typecheck, tests, build, and Playwright gates; fix failures without weakening checks.
17. Render desktop and 320px views, complete keyboard/contrast/zoom/forced-colors/VoiceOver review, and revise the weakest UI issue.
18. Run a security/privacy review, then self-review the complete diff against this plan and report evidence, risks, and untouched Git state without committing or pushing.
