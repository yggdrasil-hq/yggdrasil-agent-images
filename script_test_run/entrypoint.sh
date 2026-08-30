#!/bin/sh
set -u

: "${JOB_ID:?JOB_ID is required}"
: "${YGGDRASIL_API_URL:?YGGDRASIL_API_URL is required}"
: "${YGGDRASIL_API_TOKEN:?YGGDRASIL_API_TOKEN is required}"
: "${TARGET_REPOS:?TARGET_REPOS is required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

case "${SCRIPT_NAME:-}" in
  unit) script_file="test-unit.sh" ;;
  integration) script_file="test-integration.sh" ;;
  *) echo "script_test_run: SCRIPT_NAME must be unit or integration" >&2; exit 1 ;;
esac

git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

# Clone the primary repository and any linked repository not already wired as
# a submodule. This is the non-Pi equivalent of base/entrypoint.sh's bootstrap.
node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const normalize = (url) => url.replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();
const repoDirName = (url) => url.replace(/\.git$/, "").split("/").pop();
const repos = JSON.parse(process.env.TARGET_REPOS);
const primary = repos.find((repo) => repo.isPrimary);
if (!primary) throw new Error("TARGET_REPOS has no primary repository");

execFileSync("git", ["clone", "--recurse-submodules", primary.cloneUrl, "/workspace"], {
  stdio: "inherit",
});

const wired = new Set();
const gitmodulesPath = "/workspace/.gitmodules";
if (fs.existsSync(gitmodulesPath)) {
  try {
    const output = execFileSync(
      "git",
      ["config", "-f", gitmodulesPath, "--get-regexp", "\\.url$"],
      { encoding: "utf8" },
    );
    for (const line of output.trim().split("\n")) {
      const url = line.split(" ").slice(1).join(" ").trim();
      if (url) wired.add(normalize(url));
    }
  } catch {
    // No URL entries means no linked repository was wired yet.
  }
}

for (const repo of repos) {
  if (repo.isPrimary || wired.has(normalize(repo.cloneUrl))) continue;
  execFileSync("git", ["clone", repo.cloneUrl, `/workspace/${repoDirName(repo.cloneUrl)}`], {
    stdio: "inherit",
  });
}
NODE

if [ -n "${FEATURE_REF:-}" ]; then
  git -C /workspace fetch origin "$FEATURE_REF:$FEATURE_REF"
  git -C /workspace checkout --detach "$FEATURE_REF"
  git -C /workspace submodule update --init --recursive
fi

git config --global --unset-all url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf 2>/dev/null || true

report_path="/workspace/.yggdrasil/test-report.json"
mkdir -p /workspace/.yggdrasil
script_status=0
if [ -f "/workspace/$script_file" ]; then
  sh "/workspace/$script_file" || script_status=$?
else
  # Script presence is the group's enable/disable toggle. An absent script is
  # a successful empty group, not a failing test run.
  printf '%s\n' '{"passed":0,"failed":0,"skipped":0,"total":0,"failingTests":[],"summary":"No '"$script_file"' found; test group disabled."}' > "$report_path"
fi

# The project's script owns framework-specific translation into the canonical
# report. This runner only validates and forwards that JSON to the API.
node --input-type=module <<'NODE'
import fs from "node:fs";

const report = JSON.parse(fs.readFileSync("/workspace/.yggdrasil/test-report.json", "utf8"));
for (const field of ["passed", "failed", "skipped", "total"]) {
  if (!Number.isInteger(report[field]) || report[field] < 0) {
    throw new Error(`invalid test report field: ${field}`);
  }
}
if (report.total < report.passed + report.failed + report.skipped) {
  throw new Error("test report total is less than its result counts");
}
if (typeof report.summary !== "string" || report.summary.trim() === "") {
  throw new Error("test report summary is required");
}
if (
  report.coveragePercent !== undefined &&
  (typeof report.coveragePercent !== "number" ||
    report.coveragePercent < 0 ||
    report.coveragePercent > 100)
) {
  throw new Error("invalid test report coveragePercent");
}
if (
  !Array.isArray(report.failingTests) ||
  report.failingTests.some((test) => typeof test !== "string")
) {
  throw new Error("test report failingTests must be an array of strings");
}

const event = {
  type: "submit_test_report",
  passed: report.passed,
  failed: report.failed,
  skipped: report.skipped,
  total: report.total,
  summary: report.summary,
  failingTests: report.failingTests,
};
if (report.coveragePercent !== undefined) event.coveragePercent = report.coveragePercent;

const response = await fetch(
  `${process.env.YGGDRASIL_API_URL.replace(/\/$/, "")}/internal/jobs/${process.env.JOB_ID}/events`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.YGGDRASIL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  },
);
if (!response.ok) throw new Error(`API rejected test report: ${response.status}`);
NODE

exit "$script_status"
