# Product and Integration Landscape

**Research snapshot:** 2026-09-02
**Purpose:** Preserve the evidence and decisions that informed the initial DontGhostMe brief. Re-verify time-sensitive product, price, API, policy, and compliance claims before relying on them.

## Market conclusion

No verified product combines all of the following from the candidate's perspective:

- Historical recruiter discovery from a mailbox.
- Durable recruiter identities across address and employer changes.
- First/last contact and directional message/reply/follow-up counts.
- Opportunity and evidence-backed submission status.
- Unknown outcomes and user-correctable classifications.
- Strictly read-only Gmail access.
- Authorized LinkedIn-history input.

The market is divided among job application trackers, networking/contact trackers, general personal CRMs, and email integration infrastructure.

## Closest commercial products

### Simplify

Closest general product. It combines an application tracker, browser-assisted submission capture, networking contacts, and Gmail synchronization for recruiting emails associated with jobs. It does not document the complete recruiter-centered history, reply metrics, identity continuity, or employer-change detection envisioned for DontGhostMe.

- [Simplify](https://simplify.jobs/)
- [Email integration](https://help.simplify.jobs/articles/0236686-email-integration)
- [Networking](https://help.simplify.jobs/articles/4158996-networking-on-simplify)

### Careerflow

Strong manual networking model: contacts, roles/companies, dated activities, follow-ups, notes, and associations between contacts and jobs. No verified Gmail-wide automatic capture was found.

- [Job tracker](https://www.careerflow.ai/job-tracker)
- [Adding networking contacts](https://help.careerflow.ai/en/articles/9912646-how-to-add-networking-contacts)
- [Tracking contact activities](https://help.careerflow.ai/en/articles/9918185-tracking-activities-with-networking-contacts)

### Huntr

Mature application tracker with custom stages, notes, tasks, interviews, documents, and job-linked contacts. No verified whole-mailbox recruiter detection or reply/company-change intelligence was found.

- [Huntr job tracker](https://huntr.co/product/job-tracker)

### Dex

Personal relationship manager with communication recency, reminders, LinkedIn import, and contact/employment updates. Its Gmail approach emphasizes metadata rather than full message content, which is privacy-friendly but insufficient for reliable submission and opportunity-event classification.

- [Dex](https://getdex.com/)
- [Gmail synchronization documentation](https://getdex.com/docs/integrationsandfeatures/syncfeatures/sync-gmail)

### Sprout and LoopCV

Sprout automatically records applications and resulting messages within its own application workflow. LoopCV tracks outbound recruiter email campaigns, opens, and replies. Neither is a general historical, recruiter-centered personal CRM.

- [Sprout application tracking](https://www.usesprout.com/features/application-tracking)
- [LoopCV](https://www.loopcv.pro/)

Teal, Jobscan, Streak, folk, and JibberJobber are adjacent references, but none was verified as the complete target product.

## Open-source foundations

### Twenty

The strongest open-source CRM foundation found. It supports people, companies, opportunities, activities, mailbox synchronization, and email timelines. It would require a dedicated recruiter/job/submission domain and a carefully designed connection strategy. The repository is primarily AGPL-3.0, with separately licensed enterprise-marked areas.

- [Twenty repository](https://github.com/twentyhq/twenty)
- [Email and calendar concepts](https://docs.twenty.com/getting-started/core-concepts/calendar-and-email)

### JobSync

Active MIT-licensed self-hosted job application tracker with jobs, companies, statuses, tasks, activities, documents, and Docker deployment. It does not document the required Gmail ingestion or recruiter communication model.

- [JobSync repository](https://github.com/Gsync/jobsync)

### EspoCRM

Mature AGPL CRM with contacts, opportunities, activities, email import, and record association. It is credible infrastructure but heavier and not candidate-specific.

- [EspoCRM repository](https://github.com/espocrm/espocrm)
- [Email guide](https://docs.espocrm.com/user-guide/emails/)

### Monica

AGPL personal CRM with relationships, notes, activities, reminders, and tasks. It lacks documented Gmail-wide mailbox synchronization and job-search semantics.

- [Monica repository](https://github.com/monicahq/monica)

### GmailJobTracker

Small proof-of-concept repository that scans Gmail for job-search status. It is not a mature foundation and requires Google Cloud OAuth configuration, but it demonstrates related demand.

- [GmailJobTracker repository](https://github.com/orisha83/GmailJobTracker)

## Gmail authorization and synchronization

### Scope

Google classifies both `gmail.readonly` and `gmail.metadata` as restricted scopes. DontGhostMe needs body content to classify recruiting events, so the intended content scope is `gmail.readonly`; metadata does not avoid the restricted-scope category.

- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

A personal/development version may qualify for verification exceptions. A public server-side product processing restricted Gmail data may require verification and an annual Google-approved security assessment. Reassess against current Google policy before a public launch.

### Historical and incremental sync

Gmail supports an initial full message listing followed by incremental synchronization based on mailbox history. History checkpoints can expire, so implementations need a safe reconciliation path.

- [Gmail synchronization guide](https://developers.google.com/gmail/api/guides/sync)
- [Messages list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)

### Connector findings

- **Composio:** Managed authentication by default and a Gmail toolkit. Best initial managed-OAuth candidate, but DontGhostMe must own durable synchronization state and strict operation allowlisting.
- **Pipedream Connect:** Vendor-managed OAuth and a flexible API proxy; synchronization remains application work.
- **Nylas Shared Google App:** Most turnkey shared verified Google application and email API, but the shared app is a contract-plan offering and may be expensive.
- **Nango:** Strong sync framework, but production Gmail generally expects the customer's OAuth application.
- **Paragon:** Gmail setup expects customer Google client credentials.
- **Aurinko:** Explicitly does not provide a shared verified Google OAuth application.
- **Unipile:** Documentation reviewed was inconsistent about shared Google OAuth; obtain written confirmation before considering it.
- **Merge and Apideck:** No suitable general Gmail mailbox connector was found.

Sources:

- [Composio authentication](https://docs.composio.dev/docs/authentication/overview)
- [Composio managed versus custom authentication](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app)
- [Composio Gmail toolkit](https://docs.composio.dev/toolkits/gmail)
- [Composio data retention](https://docs.composio.dev/docs/security/data-retention)
- [Pipedream managed OAuth clients](https://pipedream.com/docs/connect/managed-auth/oauth-clients)
- [Pipedream API proxy](https://pipedream.com/docs/connect/api-proxy)
- [Nylas authentication and Shared Google App](https://developer.nylas.com/docs/v3/auth/)
- [Nango Google Mail integration](https://nango.dev/docs/api-integrations/google-mail)
- [Paragon Gmail setup](https://docs.useparagon.com/resources/integrations/gmail)
- [Aurinko shared-app FAQ](https://docs.aurinko.io/faq/does-aurinko-provide-a-shared-verified-google-oauth-application)

### Composio retention warning

Composio documents that tool request and response payloads are stored by default for up to one year. Its project-level **Don't store data** setting prevents payload retention for future calls but does not retroactively delete existing logs. Disable storage before any Gmail execution if Composio is evaluated.

## Google Takeout

A one-time Gmail export is the preferred first ingestion route because it proves historical extraction without a persistent token or a developer-owned Google Cloud OAuth application.

- [Google: download your data](https://support.google.com/accounts/answer/3024190)

Development must use synthetic fixtures, not a committed or shared copy of a user's export.

## LinkedIn constraints

Ordinary LinkedIn Sign In provides identity claims, not member inbox, applications, arbitrary employment history, or unrestricted recruiter profiles.

LinkedIn's DMA Member Data Portability API includes useful snapshot domains such as inbox, job applications, profile, and positions, but requires approval and only permits qualifying EEA members to consent. It is not a general global solution.

LinkedIn permits users to download their own data. That export is the recommended supplemental import. LinkedIn explicitly prohibits scraping and many browser extensions or automation tools that copy or automate its service.

- [Sign In with LinkedIn using OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [LinkedIn DMA data portability](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-3rd-party/)
- [LinkedIn snapshot domains](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/shared/snapshot-domain)
- [Download LinkedIn account data](https://www.linkedin.com/help/linkedin/answer/a1339364)
- [Prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387)
- [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement#dos)

## Email verification

The product the user recalled as "Recoon" is likely Reoon Email Verifier. It combines syntax, DNS/MX, disposable/role/catch-all classification, and SMTP signals. The result is a deliverability estimate—not proof of recruiter identity, employment, mailbox ownership, monitoring, consent, or guaranteed delivery.

Catch-all mail servers, aliases, delayed rejection, greylisting, and anti-enumeration create unavoidable uncertainty. Verification should be selective and user-initiated if introduced later.

- [Reoon Email Verifier](https://www.reoon.com/email-verifier/)
- [SMTP verification limitations and anti-harvesting considerations, RFC 5321 §7.3](https://www.rfc-editor.org/rfc/rfc5321.html#section-7.3)

## Decisions carried into the brief

1. Build a purpose-specific candidate/recruiter model rather than forcing all concepts into a generic job record.
2. Start with a local historical export and synthetic development fixtures.
3. Keep Gmail permissions and product capabilities strictly read-only.
4. Preserve provenance, uncertainty, and user correction.
5. Model a recruiter's identities and organization affiliations over time.
6. Do not scrape LinkedIn.
7. Defer address verification and all outbound communication.
8. Evaluate managed OAuth only after the local value proposition works.
