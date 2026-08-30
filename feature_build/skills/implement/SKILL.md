---
name: implement
description: Implement the approved ADR for this feature end-to-end without pausing for user input — write code, commit the ADR to docs/adr/NNN-<slug>.md, self-verify UI changes with Playwright when applicable, and open a draft PR. If genuinely blocked on something only a human or another job can provide, call request_action_item instead of failing. Use for feature_build runs only.
allowed-tools: [submit_build_result, request_action_item]
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

## When to request an action item instead of failing

`submit_build_result status:"failure"` is for a generic crash or bug — the
feature can't be completed as specified, and the fix is a re-attempt of the
same build. But if implementation is **genuinely blocked on something only a
human or another job can provide**, call `request_action_item` **exactly once**
as the terminal action instead. The four cases (ADR 015 item 8):

- **A missing secret/env var** the feature needs at runtime (e.g. an API key
  that must be provisioned). Name it precisely — a human will add it to the
  project's secrets.
- **A dependency that should be its own feature** — completing this feature
  requires a separate feature's code (e.g. an underlying library feature) that
  doesn't exist yet.
- **A design decision the build depends on** that needs a design session
  (`design_grill`).
- **A test the build depends on** — a blocking test request.

Do NOT call `request_action_item` for:
- A crash, error, or dead end — that's `submit_build_result status:"failure"`.
- Anything the ADR's ambiguity lets you resolve with a reasonable judgment
  call (step 3 above) — make the call and note it in the PR instead.

The distinction is: a human or another job must act before this build can
possibly succeed. If it's just a hard implementation problem, that's a failure.
This call sends the feature back to a fresh, context-seeded spec_grill with the
needed items (ADR 015 item 8); it does not mark the run failed.
