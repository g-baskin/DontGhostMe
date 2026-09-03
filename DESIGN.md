# M1–M2 design specification

## Design read

DontGhostMe is an evidence dossier, not a sales dashboard. A job seeker should quickly understand what happened, inspect the source, and correct uncertainty without destroying history.

## Directional evidence

Application references `linear.app` and `superhuman` support stable navigation and predictable control placement. Data-tool references `airtable` and `sentry` support alignment, separators, and restrained surfaces. `intercom` is the contrast: M0 avoids support-product softness and marketing-scale cards. These are observations, not templates.

## Thesis

Royal purple frames the product; gold, crimson, and acidic green add restrained pulp-noir character. Status never depends on those colors. Opaque paper-like panels, square corners, strong rules, and a crimson evidence thread create the signature timeline. Avoid glass, bento grids, hover lift, emoji, and ambient motion.

## Tokens

- Ink `#1b1525`; paper `#fff9e8`; muted paper `#f0e6c8`.
- Royal `#42145f`; dark gold `#8a6500`; crimson `#8a1730`; acid `#b8d52a`.
- Body: Source Serif 4; display: Special Elite, both loaded efficiently through `next/font`.
- Content rail: `72rem`; reading rail: `48rem`; spacing follows a 4px base.
- Focus: 3px gold outline with 3px offset; forced-colors uses system Highlight.

## Components and states

- Navigation uses ordinary links and `aria-current`.
- Metrics use labels and values, never icons alone.
- Timeline is an ordered list with headings, `<time>`, and native `<details>` evidence.
- Confidence uses text plus `<meter>` where useful.
- Review exposes explicit **Confirm fact** and **Reject fact** buttons.
- Pending actions disable both buttons and announce progress.
- Success is announced; revision conflicts preserve input and invite a reload/retry.
- Rejection removes the fact from accepted views, never its assertion or source.
- Imports follow one visible sequence: select, upload, preview, confirm, process, complete.
- Native file input, progress elements, live status, explicit pause/resume, and disclosure-based deletion remain keyboard-operable.
- Import history exposes counts and redacted states, never message content or local paths.
- Classification starts disabled until the candidate confirms at least one owned mailbox address.
- Proposal cards show state, confidence text and meter, signal explanations, bounded excerpts, and corrections.
- Identity, grouping, and submission decisions require explicit confirmation; confidence never replaces review.

## Responsive behavior

At 320px, navigation wraps, tables become stacked records, controls remain at least 44px tall, and no page scrolls horizontally. Desktop uses the same content order with wider evidence excerpts. No custom mobile menu is necessary.

## Accessibility verification

Verify all routes, navigation, evidence disclosure, export, review decisions, imports, and classification at desktop and 320px. Required evidence includes keyboard traversal, visible focus, 200% text, reduced motion, forced colors, automated axe checks, contrast inspection, and representative VoiceOver/Safari use. Automation is not a conformance claim.
