# ADR 0002: Bound historical imports before normalization

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Project owner and implementation agent
- **Supersedes:** Nothing
- **Related:** ADR 0001, `docs/plans/m1-safe-historical-import.md`

## Context

M1 must accept an extracted local Google Takeout MBOX without connecting to or altering Gmail. Mailbox, MIME, HTML, attachment, filename, and header bytes are untrusted. A malformed source must not exhaust memory, escape the local staging directory, leak content through logs, overwrite conflicts, duplicate records, or erase user review history.

The M0 `communication_events` table requires a known recruiter and conversation. Assigning those relationships during M1 would prematurely implement M2 detection/classification. M1 therefore needs a separate normalized-message layer that M2 can consume later.

## Decision

1. Accept only `.mbox`; reject ZIP, TAR, TGZ, and GZIP extensions and magic bytes. M1 contains no decompressor.
2. Stream uploads to `.local/imports/<server-generated UUID>/source.mbox` with containment checks, `0700` directories, `0600` files, actual-byte limits, incremental SHA-256, and atomic final rename.
3. Frame MBOX bytes with a custom bounded byte scanner. Hold at most one 25 MiB message buffer plus fixed stream overhead.
4. Parse each message in a disposable Node Worker using `postal-mime` 3.0.0 with explicit header/MIME limits, worker heap limits, and a five-second termination deadline.
5. Convert HTML to inert text with `html-to-text` 10.0.1. Never render or persist raw HTML. Never persist attachment content; retain only bounded display metadata, decoded size, and SHA-256.
6. Persist raw-source metadata in `import_source_messages`, normalized inert content in `normalized_messages`, and leave existing product assertions/review decisions untouched. M2 may consume normalized messages but must preserve these boundaries.
7. Use short `BEGIN IMMEDIATE` transactions with bounded `SQLITE_BUSY` retries. Imported records and the next byte checkpoint commit together.
8. Deduplicate exact raw/canonical hashes. Treat Message-ID only as supporting evidence; quarantine same-ID/different-content conflicts rather than overwriting.
9. Keep staged bytes for at most 24 hours after a pause/interruption, then purge. Delete them immediately after completion, terminal failure, or explicit deletion.
10. Expose only redacted allowlisted error codes. Message bodies, headers, addresses, subjects, filenames, and local paths never enter application logs or import-error records.

## Dependency evidence

- `postal-mime` 3.0.0: MIT-0, zero runtime dependencies, first-party Postalsys repository, ESM/CJS/TypeScript exports, and explicit parser depth/header options. It runs inside the Node worker, not the browser or database transaction.
- `html-to-text` 10.0.1: MIT, maintained first-party package, bundled TypeScript declarations, Node `>=20`, and bounded conversion controls. Node 24/26 satisfy its engine range.
- Bun 1.4.0 installs both pinned npm packages; application execution remains Node-compatible. Vitest exercises the worker/parser path under the repository's Node runtime.
- Re-verification used package registry metadata, upstream source/type declarations, and Bun's advisory audit before implementation. Final advisory results are recorded in the M1 closeout report.

No MBOX package is added. `mbox-reader` 1.2.2 is MIT and streaming-oriented but lacks TypeScript declarations and per-message byte limits; `node-mbox` 2.0.0 is older and lacks the required bounded safety contract. A small local framer is easier to constrain and test.

## Consequences

### Positive

- M2 receives normalized, inert, provenance-linked message records without M1 guessing recruiter/opportunity relationships.
- Archive bombs and archive path traversal are eliminated instead of mitigated.
- Interrupted imports resume exactly and repeat imports do not duplicate content.
- User corrections remain append-only and untouched.
- The dependency surface is two pinned parsing packages; only `html-to-text` adds transitive runtime packages.

### Negative

- Users must extract Google Takeout archives themselves.
- A temporary local copy doubles source disk usage during staging.
- Worker startup per message costs time but creates an enforceable CPU/heap/timeout boundary.
- M1 stores a bounded plain-text excerpt rather than full raw messages or attachments.
- In-process writer serialization is suitable only for the approved local single-process phase.

## Alternatives considered

### Parse compressed Takeout archives

Rejected for M1. It introduces decompression bombs, entry-path traversal, and another dependency before direct MBOX import is proven.

### Use `mailparser`

Rejected. It has a larger dependency surface and its simple API buffers attachments; M1 needs a smaller parser inside its own worker boundary.

### Use an MBOX parsing package

Rejected. Current candidates do not expose the exact message-size, checkpoint-offset, and chunk-boundary behavior required by the approved plan.

### Write directly to M0 communication events

Rejected. Those rows require recruiter/conversation classification, which belongs to M2 and would turn uncertain machine interpretation into premature product facts.

### Keep staged source indefinitely

Rejected. It increases privacy and disk exposure without improving completed imports.
