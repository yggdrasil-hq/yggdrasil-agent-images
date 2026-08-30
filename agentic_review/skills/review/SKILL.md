---
name: review
description: Review a feature's implementation diff against its approved ADR, decide whether it actually implements the ADR, and report an internal verdict via submit_review. Use for agentic_review runs only.
allowed-tools: [submit_review]
---

# review

Runs unattended on a **read-only** GitHub installation token (`contents:
read`) — this image has no write access and never opens or comments on a real
GitHub PR. Your verdict is relayed to Yggdrasil internally via the
`submit_review` tool; it is deliberately *not* a real GitHub review (ADR 015
item 14), so never try to post one.

## Assumptions about what's already done for you

- The Orchestrator has cloned all linked repos and checked out the feature
  branch `yggdrasil/<feature-slug>-<id>` on the primary repo.
- The approved ADR for this feature is at `/workspace/.yggdrasil/adr.md`.
- If the Testing stage produced report(s), they are at
  `/workspace/.yggdrasil/test-report.json` (per group) and / or
  `/workspace/.yggdrasil/test-report-*.json` — any report files under
  `/workspace/.yggdrasil/` are yours to consider as review context.

(If any assumption turns out wrong, that's a bug in this skill to fix, not
something to silently work around.)

## What "review" means here

You are answering one question about the diff on the feature branch: **does
this code actually implement the approved ADR?** Not code style, not best
practices in the abstract — does it satisfy the ADR's stated requirements,
behave the way the ADR says it should, and avoid leaving a requirement
unimplemented?

## Steps

1. Read `/workspace/.yggdrasil/adr.md` — this is the contract you're
   reviewing against.
2. Diff the feature branch against `main` on the primary repo
   (`git diff main...HEAD`), and read the changed files. For each ADR
   requirement, confirm there is code satisfying it.
3. Review any test reports under `/workspace/.yggdrasil/` — a failing or
   incomplete test on a requirement you also find unimplemented is strong
   evidence it's genuinely missing, not just tested-unreliably.
4. Decide:
   - **`approved`** — every ADR requirement is implemented. Note non-blocking
     suggestions for the human reviewer, but do not hold them.
   - **`changes_requested`** — at least one ADR requirement is not correctly
     implemented. In `summary`, describe each blocking issue concretely
     (file/location + what's wrong + what the ADR requires) so
     Implementation knows exactly what to fix.
5. Call `submit_review` **exactly once** with your `verdict` and `summary`.
6. This ends the run. Don't call any tool after `submit_review`.

## On infra trouble

If you cannot meaningfully complete the review (unreadable clone, no ADR, no
diff), do **not** invent a verdict or fall back to `approved`. Report the
blocking condition in `submit_review` with `verdict: "changes_requested"` and
a `summary` stating you could not complete the review and why — the feature
should not advance to Manual Review on a guess. (Infra-level job crashes,
separate from this, become `failed` per ADR 015 item 19 — but you should
still never green-light something you couldn't actually review.)