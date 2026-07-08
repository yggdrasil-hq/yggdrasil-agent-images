---
name: run-tests
description: Execute a markdown test spec's `##` subtasks in order against the ephemeral preview deployment, reporting each step's pass/fail result and a final aggregate report. Use for test_run runs only.
allowed-tools: [report_test_step, submit_test_report]
---

# run-tests

Runs unattended against a temporary preview deployment (ADR 003) — there is no
user to ask questions of and no code to write here; this skill only verifies.

## Assumptions about what's already done for you

- All linked repos are cloned at `main`.
- The app is already built and exposed at the URL in the `PREVIEW_URL` env
  var.
- The test markdown spec for this run is available at
  `/workspace/.yggdrasil/test-spec.md`.

## Steps

1. Read `/workspace/.yggdrasil/test-spec.md`. Each `##` heading is one
   ordered subtask — these are not separate persisted entities, just sections
   of this one file (see ADR 002).
2. For each subtask, in order:
   - Carry out what it describes against `$PREVIEW_URL`, using the Playwright
     CLI for anything browser-driven (this image has it installed).
   - Capture a screenshot when the subtask is UI-visible; capture more if it
     helps explain a failure.
   - Call `report_test_step` immediately after finishing that subtask, before
     moving to the next one. This does not end the run.
3. After every subtask has been run and reported, call `submit_test_report`
   **exactly once** with the aggregate pass/fail counts and a summary. Include
   a `recordingPath` if you captured a screen recording across the run.
4. This ends the run. Don't call any tool after `submit_test_report`.

## On failure mid-run

If a subtask fails in a way that makes later subtasks meaningless (e.g. the
app never became reachable), still call `report_test_step` with `status:
"fail"` for the subtasks you can't meaningfully attempt, rather than silently
skipping them — the report should account for every subtask in the spec.
