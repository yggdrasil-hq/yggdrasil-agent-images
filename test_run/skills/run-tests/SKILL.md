---
name: run-tests
description: Execute a markdown test spec's `##` subtasks in order against the ephemeral preview deployment, reporting each step's pass/fail result and a final aggregate report. Use for test_run runs only.
allowed-tools: [report_test_step, submit_test_report]
---

# run-tests

Runs unattended against a temporary preview deployment (ADR 003) — there is no
user to ask questions of and no code to write here; this skill only verifies.

## Assumptions about what's already done for you

- All linked repos are cloned and the primary repo is checked out at the
  requested feature ref.
- The app is already built and exposed at the URL in the `PREVIEW_URL` env
  var.
- The test markdown spec for this run is available at
  `/workspace/.yggdrasil/test-spec.md`.

## Steps

1. Read `/workspace/.yggdrasil/test-spec.md`. Each `##` heading is one
   ordered subtask — these are not separate persisted entities, just sections
   of this one file (see ADR 002).
2. For each subtask, in order:
   - Carry out what it describes against `$PREVIEW_URL`. Use the Playwright CLI
     for anything browser-driven (this image has it installed), or the browser
     check runner below when a subtask needs a recording.
   - Capture a screenshot when the subtask is UI-visible; capture more if it
     helps explain a failure.
   - Call `report_test_step` immediately after finishing that subtask, before
     moving to the next one. This does not end the run.
3. After every subtask has been run and reported, call `submit_test_report`
   **exactly once** with the aggregate pass/fail counts and a summary. Include
   a `recordingPath` if you captured a screen recording across the run.
4. This ends the run. Don't call any tool after `submit_test_report`.

## Screen recording (ADR 029)

A recording is worth capturing when a subtask's *behaviour over time* is the
thing under test — a multi-step flow, a transition, anything where a single
screenshot would not show what went wrong. It is not worth capturing for a
subtlety that a screenshot already settles.

**Recording is not a flag you can add to a CLI command.** Playwright's video
recording is a property of how a browser *context* is created, so it only
happens through the test runner, whose config already enables it. To record:

1. Write your browser checks as Playwright test files under
   `/workspace/.yggdrasil/checks/`, using `baseURL` (already pointed at
   `$PREVIEW_URL`) rather than absolute URLs.
2. Run `run-checks.sh`. It runs the checks through the pre-configured runner
   and prints the recording's path on the last line if one was produced.
3. Pass that printed path as `recordingPath` in `submit_test_report`. If it
   printed nothing, **omit `recordingPath` entirely** — see below.

Video is recorded for **every** check, passing or failing, so a failed check
arrives with its recording attached; that is the case it is most useful for.
Note `run-checks.sh` exits with the runner's status, so a failing check is
visible to you: report the affected subtask as `fail` through
`report_test_step`, with the runner's own failure detail.

### Reporting `recordingPath` honestly

Only report a path that `run-checks.sh` actually printed.

Do **not** guess a path, construct one from a naming convention, or report the
directory you expected a recording in. A recording is uploaded by the
Orchestrator from the exact path you report, and a path that resolves to nothing
is worse than no path at all: it stores a pointer that can never be opened,
where an absent one simply renders as "this run was not recorded". This is the
failure the recording feature exists to fix, so report nothing rather than
guessing.

A cheap recording is also not worth uploading: artifacts are capped (25 MB by
default) and a run whose recording exceeds the cap has it skipped — the report
is still stored, and the run is unaffected. Prefer a focused check over
recording a long idle session.

## On failure mid-run

If a subtask fails in a way that makes later subtasks meaningless (e.g. the
app never became reachable), still call `report_test_step` with `status:
"fail"` for the subtasks you can't meaningfully attempt, rather than silently
skipping them — the report should account for every subtask in the spec.
