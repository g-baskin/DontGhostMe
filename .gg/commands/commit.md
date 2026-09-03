---
name: commit
description: Run checks, agent code review, commit with AI message, and push
---

1. Run quality checks:
   `git diff --check && git diff --cached --check`
   No stack-specific lint/typecheck exists yet. Fix ALL errors before continuing.

2. Review changes: run `git status`, `git diff --staged`, and `git diff`.

3. Fast review gate: spawn ONE subagent with the full diff. Review ONLY the diff for real bugs, regressions, leftover debug code, and unintended changes. Score each issue 0-100 confidence; pre-existing issues and stylistic nitpicks are false positives and score low. Report ONLY issues scoring >= 80 with `file:line` and a one-line fix. If none, reply `CLEAR`. Be fast; this is not a deep audit.

4. If `CLEAR`, proceed to step 5 and push without asking. If issues >= 80 exist, STOP, show them, then use `ask_user` with one choice question: `id: "land"`, question: `Want me to fix this first, or commit and push anyway?`; options: `Fix it first, then commit & push` (recommended; keeps the branch green) and `Commit & push anyway` (issue stays open in the log). The card is the ONLY ask. If unavailable, ask those options in prose. On fix-first, fix and rerun step 1 without re-review; otherwise continue.

5. Stage relevant files using specific `git add` paths, never `git add -A`.

6. Generate a concise commit message, preferably one line, starting with Add, Update, Fix, Remove, or Refactor.

7. Commit and push without pausing: `git commit -m "your generated message" && git push`.
