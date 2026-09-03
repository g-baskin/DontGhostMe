# M1 security review

**Date:** 2026-09-03  
**Scope:** M1 local MBOX intake, framing, worker-isolated MIME parsing, normalization, persistence, import APIs, and dependency changes.  
**Result:** Two confirmed local-exposure/integrity defects were fixed. No confirmed path remains from mailbox bytes to code execution, filesystem traversal, SQL injection, raw-HTML rendering, external network egress, or content-bearing logs.

This is a defensive source review and automated verification, not a security certification.

## Attack surface and trust boundaries

- Untrusted sources: import names, declared lengths, streamed MBOX bytes, envelope/header/MIME/body/attachment data, route identifiers, request host/origin headers, and SQLite lock timing.
- Sensitive assets: staged mailbox bytes, normalized message text, sender/recipient identities, provenance, user corrections, local database integrity, CPU/memory/disk availability, and logs.
- Dangerous sinks reviewed: staged filesystem writes/deletion, worker `eval`, MIME/HTML parsing, SQLite statements/transactions, API responses, and console output.
- Assumption: M1 remains the documented single-owner, loopback-only local application. Hosted or multi-user operation requires a new authorization and deployment review.

## Confirmed findings fixed

### M1-SEC-01 — Local data server could bind beyond loopback

- **Severity before fix:** Medium.
- **Path:** A LAN-reachable Next development server could expose pages and origin-less API requests; Host validation alone does not prove the peer is local because Host is client-controlled.
- **Fix:** `dev` and the new `start` command explicitly bind Next to `127.0.0.1`. Browser mutations now require the Origin host and port to exactly match the request Host.
- **Evidence:** `package.json`, `src/application/local-request.ts`, and eight local-request regression cases.

### M1-SEC-02 — Concurrent processing could race one checkpoint

- **Severity before fix:** Low.
- **Path:** Two local process/resume requests for one import could read the same checkpoint and parse concurrently before SQLite serialized their writes, risking redundant work and source-deletion races.
- **Fix:** One in-process batch lease per database/import rejects the second batch with recoverable `database_busy`; the lease is always released in `finally`.
- **Evidence:** `src/application/historical-imports.ts` and the concurrent-batch integration regression.

## Candidates verified and dropped

| Candidate | Source-to-sink verification | Decision |
| --- | --- | --- |
| Worker `eval` | The evaluated string is a source constant; mailbox bytes enter only the worker message and PostalMime parser. | Drop: no untrusted code reaches evaluation. |
| SQL injection | Values use prepared-statement parameters; the only generated SQL fragment is a placeholder count derived from internal status arrays. | Drop: no input reaches SQL syntax. |
| Path traversal | Client names are display-only; filesystem paths use validated UUIDs, fixed `source.mbox`/`.part` names, resolved-root containment, `0700` directories, and `0600` files. | Drop: no client path reaches a filesystem path. |
| Archive extraction | ZIP/GZIP/TAR magic and archive extensions fail closed; no decompression or archive API exists. | Drop: no extraction sink exists. |
| Stored XSS | Raw HTML is converted inside the bounded worker to inert text; links lose targets; script/style/form/iframe/image nodes are skipped; React renders text normally. | Drop: raw HTML never reaches storage or an HTML rendering sink. |
| Content leakage through errors/logs | Parser failures map to allowlisted codes; API errors return codes; import code contains no content-bearing console call; the privacy regression observes no console output. | Drop: no mailbox content reaches logs or arbitrary errors. |
| External exfiltration | M1 ingestion/application modules contain no network client or external AI/analytics call. | Drop: no egress sink exists. |

Seven candidates were dropped after source-to-sink verification; two survived and were fixed.

## Dependency review

- `postal-mime@3.0.0` is pinned as a direct runtime dependency with zero transitive runtime dependencies.
- `html-to-text@10.0.1` is pinned; its transitive runtime graph is lockfile-controlled.
- Current `bun audit` reports no advisory for either M1 runtime dependency.
- `bun audit` still reports `GHSA-67mh-4wv8-2f99` against transitive `esbuild@0.18.20` under `drizzle-kit` tooling. It is not on the M1 runtime parser path; loopback binding reduces the cited development-server exposure. This inherited tooling advisory remains open because no verified compatible direct upgrade removes that transitive version.

## Verification

- `bun run check:fix` — pass; the security-edited source formatted cleanly.
- `bun run typecheck` — pass.
- `bun run test -- tests/application/local-request.test.ts tests/ingestion/privacy-log.test.ts tests/db/historical-import.test.ts` — pass; 20 tests.
- `bun audit` — nonzero only for the documented inherited moderate esbuild advisory.
- Full post-fix gates are recorded in the M1 quality report.

## Not checked

- No real mailbox, production-like personal data, hosted deployment, proxy, container, multi-user authorization model, or external integration was tested; all are prohibited or deferred.
- Git-history secret scanning was not available as a dedicated scanner in this environment; tracked M1 fixtures and test values are synthetic `.example` data.
- Worker isolation limits resource use but are not an operating-system sandbox; the two pinned parser packages still execute with the local process user's authority.
