# Agent entry point

Read [`CLAUDE.md`](./CLAUDE.md) before planning, generating, or changing code. It is the authoritative project context and contains non-negotiable privacy and authorization boundaries.

Then read:

1. [`docs/PRODUCT_BRIEF.md`](./docs/PRODUCT_BRIEF.md) for the product model and intended user experience.
2. [`ROADMAP.md`](./ROADMAP.md) for sequencing and the currently approved scope.
3. [`docs/research/product-landscape.md`](./docs/research/product-landscape.md) before proposing integrations or claiming that an existing product/API supports a capability.

## Non-negotiable rules

- DontGhostMe is candidate-owned. Optimize for the job seeker's control, visibility, export, correction, and deletion.
- Gmail access is read-only. Never add send, compose, draft, modify, label, archive, trash, or delete permissions or features.
- The only planned Gmail mailbox-content scope is `https://www.googleapis.com/auth/gmail.readonly`.
- Do not scrape LinkedIn, use LinkedIn session cookies, call hidden LinkedIn APIs, or automate LinkedIn pages. Authorized user-uploaded exports and notification emails are allowed inputs.
- Never commit OAuth tokens, email archives, parsed messages, recruiter data, extracted attachments, secrets, or production-like personal fixtures.
- Never upload a real Google Takeout archive or real message body to tests, logs, telemetry, an LLM, or a third-party service.
- Use synthetic fixtures. Treat email bodies, HTML, attachments, exports, and integration responses as untrusted input.
- Preserve source provenance and confidence for machine-extracted facts. Users must be able to correct uncertain matches.
- Do not add live OAuth, mailbox synchronization, external AI calls, email verification, analytics, or telemetry during the initial scaffold unless the user explicitly approves a plan for that capability.
- This repository is public and licensed AGPL-3.0. Do not introduce incompatible code or dependencies.

## Current instruction

The repository is at the pre-scaffold stage. The next coding session should inspect these documents, propose a small scaffold plan and stack, and keep the first implementation limited to local development, synthetic data, domain contracts, and an application shell. Do not race ahead into production integrations.
