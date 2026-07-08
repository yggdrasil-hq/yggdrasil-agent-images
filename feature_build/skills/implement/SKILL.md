---
name: implement
description: Implement the approved ADR for this feature end-to-end without pausing for user input — write code, commit the ADR to docs/adr/NNN-<slug>.md, self-verify UI changes with Playwright when applicable, and open a draft PR. Use for feature_build runs only.
allowed-tools: [submit_build_result]
---

# implement

Runs unattended: this image has no `ask_user` tool, so never stop to ask the
user anything. If something in the ADR is ambiguous, make the most reasonable
call and note the judgment call in the PR description and commit message —
don't block on it.

## Assumptions about what's already done for you

- The Orchestrator has already cloned all linked repos and checked out the
  feature branch `yggdrasil/<feature-slug>-<id>` on the primary repo. Do not
  create this branch yourself.
- The approved ADR markdown for this run is available at
  `/workspace/.yggdrasil/adr.md`.

(If either assumption turns out wrong once the Orchestrator's job-dispatch
implementation lands, that's a bug in this skill to fix, not something to
work around silently.)

## Steps

1. Read `/workspace/.yggdrasil/adr.md` — this is your implementation contract.
2. Read `docs/CONTEXT.md` and `docs/adr/` in the target repo for terminology
   and conventions, same as the grill phase did.
3. Implement the feature.
4. Commit the ADR itself to `docs/adr/NNN-<slug>.md` on the feature branch,
   where `NNN` is the next sequential number after whatever already exists in
   the target repo's `docs/adr/` (zero-padded to 3 digits) and `<slug>` is a
   short kebab-case title from the ADR's own heading.
5. If this image has Playwright available (it does — `feature_build` installs
   it) and the change touches UI: start the app, drive the changed surface
   with Playwright, and confirm it behaves as the ADR describes before moving
   on. Don't skip this for UI-touching changes; do skip it for changes with no
   UI surface (pure backend/API/infra work).
6. Push the branch and open a **draft** PR on the primary repo (`gh pr create
   --draft`), with a description summarizing what was built and linking the
   ADR.
7. Call `submit_build_result` **exactly once**:
   - `status: "success"` with `prUrl` set, once the draft PR is open.
   - `status: "failure"` with a `summary` explaining why, if you conclude the
     feature can't be completed as specified — don't leave the run hanging
     without calling this.
8. This ends the run. Don't call any tool after `submit_build_result`.
