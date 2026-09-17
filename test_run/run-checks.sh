#!/bin/sh
set -eu

# Run a test_run's browser checks and surface the recording they produced
# (ADR 029).
#
# One command for the skill, so the skill never has to know where Playwright is
# installed, what its config is called, or how its per-test output is laid out.
# Its contract is small:
#
#   - runs the Playwright test runner against /workspace/.yggdrasil/checks
#   - always prints the test runner's own output (so a failing check's detail
#     reaches the transcript and can be reported via report_test_step)
#   - prints the recording's path on the LAST line when one exists, and prints
#     nothing extra when it does not
#   - exits with the test runner's status, so a failing browser check is visible
#     to the skill as a failure rather than being swallowed
#
# The exit status is deliberately the runner's rather than this script's own:
# a check that failed must look failed. Note that a failed check still records —
# the config sets `video: "on"` for every test, passing or failing — so a failure
# comes with its recording, which is the case the artifact is most useful for.
#
# This script does NOT itself fail the job. The skill decides what a failing
# browser check means for the subtask it was verifying and reports it through
# `report_test_step`; `set -e` is therefore deliberately not used around the
# runner invocation below.
#
# The `|| rc=$?` form is what lets a non-zero runner status be captured without
# `set -e` aborting the script before the recording is collected.

RUNNER_DIR="${PLAYWRIGHT_RUNNER_DIR:-/opt/playwright}"
CHECKS_DIR="${PLAYWRIGHT_TEST_DIR:-/workspace/.yggdrasil/checks}"

# Resolved relative to this script rather than hard-coded to /usr/local/bin, so
# the pair works both as installed (both files land in the same directory in the
# image) and when run straight out of the repo during development.
SELF_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

rc=0
if [ -d "$CHECKS_DIR" ]; then
  (
    cd "$RUNNER_DIR"
    npx playwright test --config "$RUNNER_DIR/playwright.config.ts"
  ) || rc=$?
else
  # No checks written: nothing to run, and not a failure. A test_run whose
  # subtasks are all API-level or CLI-level legitimately has no browser checks.
  printf '%s\n' "run-checks: no browser checks found at $CHECKS_DIR; skipping"
fi

# Collected unconditionally, including after a failing run — a failed check's
# recording is the most valuable one. Prints the path only when a recording
# actually exists, so the caller can omit `recordingPath` rather than report a
# path that resolves to nothing.
recording="$(sh "$SELF_DIR/collect-recording.sh" || true)"
if [ -n "$recording" ]; then
  printf 'run-checks: recording at %s\n' "$recording"
fi

exit "$rc"
