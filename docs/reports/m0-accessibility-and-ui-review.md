# M0 accessibility and UI review

**Date:** 2026-09-02  
**Scope:** Home, Recruiters, Recruiter Detail, Opportunities, Review Queue, Data & Privacy, and JSON export.  
**Claim:** This is implementation evidence, not a WCAG or legal conformance claim.

## Rendered evidence

- Desktop home: `.gg/screenshots/m0-home-desktop.png` (1440 by 1000 CSS pixels).
- Narrow recruiter detail: `.gg/screenshots/m0-jane-mobile-revised.png` (320 by 800 CSS pixels, full page).
- The first critique removed an unnecessary page-edge gradient and reduced mobile timeline indentation.

## Checks

| Area | Result | Evidence |
|---|---|---|
| Landmarks, headings, lists, time, disclosure, meter | Pass | Native HTML inspected in rendered browser and component source. |
| Primary keyboard path | Pass | Browser test tabs to the skip link, moves focus to main, and opens source evidence with Enter. |
| Focus visibility | Pass | 3px dark-gold outline; forced colors switches to system Highlight. |
| Text contrast | Pass | Ink/paper 16.91:1; paper/royal 13.34:1; dark-gold/paper 5.07:1; crimson/paper 8.89:1. |
| Non-color status | Pass | Every direction, confidence, and review state has text and shape. |
| 320px reflow | Pass | Browser checks four representative routes with no horizontal overflow. |
| 200% text and text spacing | Pass | Browser stress test retains 320px reflow and evidence operability. |
| Reduced motion | Pass | Named button transitions reduce to 0.01ms; no ambient motion exists. |
| Forced colors | Pass | Browser emulation preserves focus and evidence-thread boundaries. |
| Automated accessibility | Pass | Axe reports zero configured violations across all six routes. |
| Review feedback and recovery | Pass | Pending, disabled, success, rejection, and stale-revision conflict paths exist. |
| VoiceOver with Safari | Unverified | Headless automation cannot provide representative spoken-output evidence. |

## Rendered quality score

| Criterion | Score | Evidence |
|---|---:|---|
| Brief specificity | 2 | Candidate-owned evidence, uncertainty, and corrections lead every route. |
| Information hierarchy | 2 | Notice, dossier heading, direct timeline action, then metrics. |
| Composition | 2 | Header, main, footer, cards, and timeline share one rail and spacing scale. |
| Consistency and flow | 2 | Navigation, records, labels, evidence, and actions repeat predictably. |
| Typography | 2 | Source Serif body and Special Elite dossier roles remain readable at both widths. |
| Material logic | 2 | Opaque paper, rules, and one evidence thread communicate containment and chronology. |
| State completeness | 2 | Review pending, success, rejection, confirmation, and conflict states are covered. |
| Responsive behavior | 2 | Navigation, records, metrics, and chronology recompose without clipping at 320px. |
| Accessibility floor | 1 | Automated and keyboard evidence passes; VoiceOver/Safari remains unverified. |
| Motion purpose | 2 | Only short button state transitions exist, with reduced-motion handling. |
| Content authenticity | 2 | All people, messages, companies, and metrics are clearly marked synthetic. |
| Visual distinctiveness | 2 | Dossier typography and crimson evidence thread remain recognizable without branding. |

**Score:** 23/24. The remaining point requires representative VoiceOver/Safari verification.
