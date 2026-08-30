#!/bin/sh
set -eu

# script_test_run is the non-agent test job kind (ADR 015 items 10-11). This
# entrypoint clones the primary repo, runs the structure standard's optional
# `test-unit.sh` / `test-integration.sh` scripts (ADR 008 item 6, amended by
# ADR 015), and leaves the canonical `.yggdrasil/test-report.json` for the
# Orchestrator/API to read. Yggdrasil never parses jest/JUnit/lcov — the
# project's own script owns that translation and must write
# `.yggdrasil/test-report.json`: {passed, failed, skipped, total,
# coveragePercent?, failingTests: []}.

# Auth + cloning follow base/entrypoint.sh's pattern (TARGET_REPOS is the
# JSON-encoded FeatureSpecRepo list, GITHUB_TOKEN a `contents: read` token),
# minus Pi entirely.
if [ -n "${TARGET_REPOS:-}" ]; then
  git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

  node <<'NODE'
const { execFileSync } = require("node:child_process");

const repos = JSON.parse(process.env.TARGET_REPOS);
const primary = repos.find((repo) => repo.isPrimary);
if (primary) {
  execFileSync("git", ["clone", "--recurse-submodules", primary.cloneUrl, "/workspace"], { stdio: "inherit" });
} else {
  console.error("script_test_run: no primary repo in TARGET_REPOS");
  process.exit(1);
}
NODE

  # spec_grill tore the rewrite down after cloning because its token is
  # contents:read anyway; the test runner only reads too, so a plain read of
  # the checkout needs no push auth beyond the clone — but the scripts may
  # legitimately need to fetch/install deps from the repo remote, which the
  # rewrite still covers. Keep it simple: leave the rewrite in place for the
  # duration of the run; the container is short-lived and torn down after.
fi

# The canonical report path. Scripts write here; if no script runs we still
# produce a report so the API has something deterministic to read.
REPORT_DIR=/workspace/.yggdrasil
REPORT_FILE="$REPORT_DIR/test-report.json"
mkdir -p "$REPORT_DIR"

# Determine which scripts exist (each is its own enable/disable toggle; ADR
# 015 item 10). Scripts may run against either `main` (default test_run
# posture) or the feature branch a Testing-stage dispatch targets.
cd /workspace

run_script() {
  script="$1"
  name="$2"
  if [ ! -x "$script" ] && [ ! -f "$script" ]; then
    return 1
  fi
  # Shell scripts may omit the executable bit but still be valid; run via sh
  # if not executable, otherwise run directly.
  echo "script_test_run: running $name ($script)"
  if [ -x "$script" ]; then
    "$script"
  else
    sh "$script"
  fi
  return 0
}

# Which scripts exist (each is its own enable/disable toggle; ADR 015 item
# 10). Scripts may run against either a branch the dispatch targeted.
run_unit=false
run_integration=false

if run_script "./test-unit.sh" "unit"; then
  run_unit=true
fi
if run_script "./test-integration.sh" "integration"; then
  run_integration=true
fi

# Scripts may write their report either to the single canonical
# test-report.json (common single-script case) or to a per-group file
# test-report-unit.json / test-report-integration.json. When scripts write
# the single canonical file, a later script's write wins (last writer wins).
# If only per-group files exist, merge them into the canonical path below.

# Merge any per-group reports present into the canonical file.
if command -v node >/dev/null 2>&1; then
  node <<'NODE'
const fs = require("node:fs");
const path = "/workspace/.yggdrasil";

function safeRead(id) {
  const file = path + "/test-report-" + id + ".json";
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function sum(acc, r) {
  if (!r) return acc;
  acc.passed += r.passed || 0;
  acc.failed += r.failed || 0;
  acc.skipped += r.skipped || 0;
  acc.total += r.total || (r.passed||0) + (r.failed||0) + (r.skipped||0);
  if (r.coveragePercent != null) acc.coveragePercent = (acc.coveragePercent||0) + r.coveragePercent;
  acc.failingTests = (acc.failingTests||[]).concat(r.failingTests||[]);
  return acc;
}
const agg = { passed: 0, failed: 0, skipped: 0, total: 0, coveragePercent: 0, failingTests: [] };
const any = safeRead("unit") || safeRead("integration");
if (any) {
  [safeRead("unit"), safeRead("integration")].forEach((r) => sum(agg, r));
  // Only write the canonical file if no per-run script already wrote a real
  // report *and* we have group reports to merge.
  if (!fs.existsSync(path + "/test-report.json")) {
    fs.writeFileSync(path + "/test-report.json", JSON.stringify(agg, null, 2));
  }
}
NODE
fi

# If nothing produced a canonical report (no scripts, or scripts that wrote
# nothing), emit an empty one so the API always has a determinable outcome.
if [ ! -f "$REPORT_FILE" ]; then
  if [ "$run_unit" = false ] && [ "$run_integration" = false ]; then
    echo '{"passed":0,"failed":0,"skipped":0,"total":0,"failingTests":[]}' > "$REPORT_FILE"
    echo "script_test_run: no test-unit.sh / test-integration.sh present; wrote empty report"
  else
    # Scripts ran but produced no report file — treat as a failure to conform
    # to the convention (ADR 015 item 11: the script is responsible for
    # writing the canonical report).
    echo "script_test_run: script(s) ran but produced no $REPORT_FILE" >&2
    echo '{"passed":0,"failed":0,"skipped":0,"total":0,"failingTests":[{"name":"missing report","message":"no .yggdrasil/test-report.json written by test scripts"}]}' > "$REPORT_FILE"
  fi
fi

echo "script_test_run: report written to $REPORT_FILE"
cat "$REPORT_FILE"