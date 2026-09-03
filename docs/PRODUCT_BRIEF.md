# DontGhostMe Product Brief

**Status:** M0 implemented; M1 safe historical import planning next
**Last updated:** 2026-09-03

## One-sentence concept

DontGhostMe is a private, candidate-owned recruiter CRM that reconstructs recruiting relationships, opportunities, submissions, and unresolved outcomes from the user's own communication history.

## Problem

Recruiters contact candidates through email and LinkedIn, discuss one or more roles, request resumes or right-to-represent confirmations, promise updates, disappear, return months later, and sometimes move to another company. The candidate is left without a reliable record of:

- Who contacted them and when.
- Which company the recruiter represented at that time.
- Which end client and job were involved.
- Whether the candidate was actually submitted.
- How often either party replied or followed up.
- Whether an application ended, stalled, or simply has an unknown outcome.
- Whether an old recruiter or email address is still current.

Conventional job trackers require manual entry and center the job. Conventional CRMs center sales relationships. DontGhostMe centers the candidate's long-term relationship with recruiters while connecting that relationship to jobs.

## Primary user

The first user is one job seeker importing their own Gmail history. The architecture may later support many users, but the initial product should not prematurely assume public SaaS scale.

## Product principles

1. **Candidate-owned:** The user controls imports, corrections, exclusions, exports, disconnection, and deletion.
2. **Read, never act:** Mailbox integrations observe; they do not send, draft, alter, label, archive, or delete.
3. **Evidence over certainty:** Every inferred fact should link to a source and state its confidence.
4. **People persist across employers:** A recruiter remains one person as affiliations and addresses change.
5. **Unknown is a valid status:** The product must not invent closure or label every silence as ghosting.
6. **Local and minimal first:** Prove value with an exported mailbox and synthetic development data before maintaining a live token.
7. **No prohibited LinkedIn automation:** Use official exports, manual input, and notification emails—not scraping.
8. **No hidden outreach:** Address verification and any future communications require explicit user action and separate approval.

## Core user stories

- As a candidate, I can import communication history and review likely recruiters before they enter my permanent tracker.
- I can see a recruiter's first and latest contact, identities, employer history, and all associated opportunities.
- I can distinguish recruiter messages, my replies, recruiter follow-ups, and unanswered messages.
- I can see whether an opportunity was merely discussed, had a resume requested, received right-to-represent approval, was explicitly submitted, reached interview, was rejected, produced an offer, was withdrawn, or ended without a known outcome.
- I can correct a mistaken person merge, company affiliation, opportunity association, or event classification.
- I can mark recruiters as active, dormant, do-not-contact, or excluded without altering Gmail.
- I can inspect the source supporting an extracted fact.
- I can delete imported data or disconnect future synchronization without affecting the source mailbox.

## Proposed information architecture

### Home

- Relationships needing review
- Opportunities awaiting an update
- Recent recruiter activity
- Possible recruiter company changes
- Unresolved or stale submissions

### Recruiters

- Searchable recruiter directory
- First/last contact
- Current organization
- Relationship status
- Message/reply/follow-up metrics
- Opportunity count and outcome summary

### Recruiter detail

- Identity and organization history
- Unified chronological timeline
- Related opportunities
- Derived communication metrics
- Possible duplicates and uncertain facts
- Exclude, correct, merge, split, and do-not-contact controls

### Opportunities

- Role, staffing company, end client, compensation, location, employment type
- Recruiter(s)
- Evidence-backed stage history
- Submission status and last-known outcome

### Review queue

- Is this person a recruiter?
- Are these identities the same person?
- Is this a new opportunity or an existing one?
- Was the candidate actually submitted?
- Does this signature indicate a company change?
- Is this message a follow-up/re-send?

### Data and privacy

- Import status
- Connected accounts
- Excluded senders/domains
- Export data
- Delete imported data
- Disconnect Gmail
- Retention controls

## Initial event vocabulary

Use a controlled vocabulary but retain an `unknown` path:

- `initial_outreach`
- `opportunity_details`
- `candidate_reply`
- `recruiter_follow_up`
- `resume_requested`
- `resume_received`
- `right_to_represent_requested`
- `right_to_represent_confirmed`
- `submission_claimed`
- `submission_confirmed_by_user`
- `interview_requested`
- `interview_scheduled`
- `interview_completed`
- `status_update`
- `rejection`
- `offer`
- `candidate_withdrew`
- `opportunity_closed`
- `company_change_signal`
- `unknown`

Names are provisional. Domain contracts should make changes and versioned reclassification possible.

## Minimum useful recruiter metrics

- First observed contact timestamp
- Last observed contact timestamp
- Recruiter-to-candidate message count
- Candidate-to-recruiter message count
- Recruiter follow-up count
- Current unanswered side
- Last response latency
- Median response latency by direction, once enough data exists
- Number of opportunities discussed
- Number of explicit submissions
- Interview, rejection, offer, withdrawal, and unknown-outcome counts

Do not present derived metrics without defining them in the interface.

## Historical import approach

The first proof of concept should accept a user-created Google Takeout mail export. Development and automated tests must use synthetic MBOX/MIME fixtures only.

A staged pipeline should:

1. Validate and inventory the import.
2. Parse messages without rendering active content.
3. Normalize provider message IDs, threads, addresses, dates, subjects, and text.
4. Deduplicate repeat imports idempotently.
5. Identify likely recruiting conversations using deterministic signals.
6. Associate participants, organizations, and opportunity candidates.
7. Extract events with provenance and confidence.
8. Present uncertain results for confirmation.

The product should be useful without an LLM. Any later model-assisted extraction must be replaceable, observable, prompt-injection-resistant, and optional in the privacy design.

## Gmail connection direction

The likely prototype connector is Composio managed authentication because users need not create their own Google Cloud OAuth application. This is not an implementation approval.

Before implementation, verify:

- Exact consent-screen scopes and provider ownership.
- Ability to request only `gmail.readonly` plus minimum identity scopes.
- Payload logging disabled before the first read.
- Historical pagination and incremental-history behavior.
- Token revocation and account disconnection.
- Data processing, retention, subprocessor, and deletion terms.
- Production eligibility for the intended use case.

Nylas Shared Google App and Pipedream Connect are alternatives for later evaluation. A public SaaS needs a dedicated Google restricted-scope compliance plan.

## LinkedIn direction

Ordinary LinkedIn OAuth does not provide a general member inbox, application history, or arbitrary employment/profile synchronization API. The broadly acceptable route is user-uploaded official LinkedIn data exports, supplemented by LinkedIn notification emails already present in Gmail and manual corrections.

Do not build LinkedIn DOM scraping, private API calls, session-cookie access, or automation.

## Email-address verification direction

Reoon is a possible low-cost verifier, but verification only estimates whether an address may accept mail. It does not establish employment, ownership, monitoring, consent, or guaranteed delivery.

Verification is not part of the initial product. If added later, it should be selective, user-initiated, rate-limited, clearly labeled, and should preserve `unknown` and catch-all results.

## Explicit non-goals for the first scaffold

- Live Gmail OAuth or synchronization
- Sending, drafting, editing, labeling, archiving, or deleting email
- LinkedIn connection or scraping
- Real Google Takeout data
- Production authentication or multi-tenancy
- AI provider integration
- Attachment extraction
- Email-address verification
- Automatic recruiter outreach
- Billing
- Mobile application

## Success signal for the first meaningful prototype

Using a synthetic historical mailbox, a user can review detected recruiters, open one recruiter's unified history, see correctly separated opportunities and communication counts, confirm or correct inferred submission events, and re-import the same archive without creating duplicates.
