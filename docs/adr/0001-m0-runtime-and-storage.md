# ADR 0001: M0 runtime and local storage

- **Status:** Accepted
- **Date:** 2026-09-02

## Context

M0 must prove a private, synthetic, single-user workflow without hosted services. The application needs reviewable migrations, source provenance, append-only corrections, deterministic replay, and a portable export. Application code must remain Node-compatible while Bun is the package manager and command launcher.

## Decision

Use Bun 1.4.0 for dependency management, Node 24.20.0 as primary runtime, and Node 26.4.0 as compatibility runtime. Use Next.js 16.3.4, React 19.2.8, strict TypeScript 7.0.2, and Biome 2.5.11.

Persist M0 data in local SQLite through Drizzle ORM and `better-sqlite3` 13.0.3. Database startup fails unless SQLite is at least 3.51.3, foreign keys are enabled, WAL is active, busy timeout is 5000ms, synchronous mode is FULL, and FTS5 is available. Writes use short immediate transactions. Imports are stable, idempotent batches of at most 100 messages. Review decisions are append-only and revision-guarded. Migrations are committed SQL and forward-only.

The database lives on local disk. Before non-synthetic data, create and verify an online backup before migration. The M0 backup command verifies integrity, foreign keys, and representative counts, but does not claim disaster recovery.

## Consequences

- A native SQLite dependency must have prebuilds for both supported Node versions.
- One process owns writes; multiple writers, hosts, or tenants are unsupported.
- Source records and assertions remain immutable; corrections add review decisions.
- SQLite is simple and inspectable, but not a hosted multi-user database.

## Alternatives considered

- `node:sqlite`: fewer dependencies, deferred until its API is stable.
- local libSQL: remote-replica features add unnecessary M0 complexity.
- `bun:sqlite`: rejected because application persistence must remain Node-compatible.

## PostgreSQL trigger

Adopt PostgreSQL through a new ADR before multiple instances, multiple writers, hosted operation, tenant isolation/RLS, pooling, replication, or point-in-time recovery.
