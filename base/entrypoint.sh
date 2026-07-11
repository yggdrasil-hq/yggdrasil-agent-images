#!/bin/sh
set -eu

# Pi's own models.json only documents $VAR interpolation for the `apiKey`
# field, not `baseUrl`/model `id` — so this renders the whole file with
# envsubst instead of relying on Pi to do it. MODEL_BASE_URL / MODEL_API_KEY /
# MODEL_ID are injected by the Orchestrator as job-pod env vars, decrypted
# server-side from the project's `project_secrets` row (ADR 004).
envsubst < /root/.pi/agent/models.json.template > /root/.pi/agent/models.json

# Clone the primary repo (with its submodules) before Pi ever starts (ADR 006
# item 6, reworked by ADR 008 items 8-10): a project's sub-repos are wired as
# git submodules of the primary (not sibling clones) once project_init's
# feature_build has run once, so the primary clones with --recurse-submodules
# and picks them up for free. TARGET_REPOS (JSON-encoded FeatureSpecRepo list)
# and GITHUB_TOKEN are only set for job kinds that need repos on disk
# (spec_grill and feature_build today, ADR 010) — skip entirely if absent so
# this stays a no-op for any job kind that doesn't set them. A clone failure
# exits non-zero here (via `set -e` + node's own process.exit(1) on error),
# failing the job before Pi starts rather than handing an agent an empty/wrong
# workspace and letting it improvise its way to a wrong conclusion (verified
# against a real stuck run: an empty workspace led the agent to `git init` a
# fresh repo and plan to push to it, exactly the write access it doesn't
# have).
#
# feature_build only (ADR 010 item 3): FEATURE_BRANCH, if set, is checked
# out on the primary repo right after cloning — the implement skill's own
# documented assumption is that this is already done by the time it starts,
# so it never runs `git checkout -b` itself. ADR_MARKDOWN, if set, is written
# verbatim to /workspace/.yggdrasil/adr.md — the approved ADR the implement
# skill treats as its implementation contract. Both are no-ops when absent
# (spec_grill sets neither), exactly like TARGET_REPOS itself.
#
# Bootstrap case: a project's very first project_init run happens *before*
# any submodule has ever been wired (that wiring is itself project_init's
# own feature_build output — see ADR 008 item 9), so --recurse-submodules is
# a no-op the first time. Any TARGET_REPOS entry not already present as a
# wired submodule after the primary clone is cloned as a sibling at
# /workspace/<repo-name> instead, exactly like every repo was cloned before
# ADR 008 — this is what lets project-init's grill session see and reason
# about sub-repos that aren't submodules yet.
#
# Auth: a single global git URL rewrite covers both the top-level clone and
# every submodule fetch git itself makes from whatever's literally in
# .gitmodules (this container never gets a chance to rewrite those URLs
# individually in advance) — no per-repo token embedding needed, so unlike
# before, no repo's `origin` remote ever contains the token in the first
# place. The rewrite is still removed from global config immediately after
# cloning finishes, so nothing that runs afterwards (including the agent's
# own shell tool, via `git config --global --list`) can read it back out.
#
# Uses node (already required for Pi) instead of adding a jq dependency.
if [ -n "${TARGET_REPOS:-}" ]; then
  git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

  node <<'NODE'
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

function normalize(url) {
  return url.replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();
}

function repoDirName(cloneUrl) {
  return cloneUrl.replace(/\.git$/, "").split("/").pop();
}

try {
  const repos = JSON.parse(process.env.TARGET_REPOS);
  const primary = repos.find((repo) => repo.isPrimary);

  if (primary) {
    execFileSync(
      "git",
      ["clone", "--recurse-submodules", primary.cloneUrl, "/workspace"],
      { stdio: "inherit" },
    );
  }

  // Which sub-repos (if any) already came along as wired submodules of the
  // primary — read straight from .gitmodules rather than assuming, since a
  // project may be mid-migration (some sub-repos wired, some not yet).
  const wired = new Set();
  const gitmodulesPath = "/workspace/.gitmodules";
  if (fs.existsSync(gitmodulesPath)) {
    const out = execFileSync(
      "git",
      ["config", "-f", gitmodulesPath, "--get-regexp", "\\.url$"],
      { encoding: "utf8" },
    );
    for (const line of out.trim().split("\n")) {
      const url = line.split(" ").slice(1).join(" ").trim();
      if (url) wired.add(normalize(url));
    }
  }

  // Fallback sibling clone for any linked repo not already a wired
  // submodule (the pre-migration/bootstrap case).
  for (const repo of repos) {
    if (repo.isPrimary) continue;
    if (wired.has(normalize(repo.cloneUrl))) continue;

    const dir = `/workspace/${repoDirName(repo.cloneUrl)}`;
    execFileSync("git", ["clone", repo.cloneUrl, dir], { stdio: "inherit" });
  }
} catch (err) {
  console.error("entrypoint: failed to clone target repos:", err.message);
  process.exit(1);
}
NODE

  # feature_build's two setup steps (ADR 010 item 3) — run after the clone
  # (both primary and any sibling sub-repos) has fully succeeded, before the
  # auth rewrite is torn down below, though neither actually needs GitHub
  # auth itself.
  if [ -n "${FEATURE_BRANCH:-}" ]; then
    git -C /workspace checkout -b "$FEATURE_BRANCH"
  fi
  if [ -n "${ADR_MARKDOWN:-}" ]; then
    mkdir -p /workspace/.yggdrasil
    printf '%s\n' "$ADR_MARKDOWN" > /workspace/.yggdrasil/adr.md
  fi

  git config --global --unset-all url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf
fi

# Pi doesn't auto-discover extensions dropped under ~/.pi/agent/extensions/ —
# it only loads what's registered via `pi install` or passed explicitly here.
# Without --extension, ask_user/submit_adr/etc. never reach the model's tool
# list regardless of which model is configured (verified against a real
# stuck run).
exec pi --mode rpc --extension /root/.pi/agent/extensions/yggdrasil-contract/src/index.ts "$@"
