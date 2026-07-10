#!/bin/sh
set -eu

# Pi's own models.json only documents $VAR interpolation for the `apiKey`
# field, not `baseUrl`/model `id` — so this renders the whole file with
# envsubst instead of relying on Pi to do it. MODEL_BASE_URL / MODEL_API_KEY /
# MODEL_ID are injected by the Orchestrator as job-pod env vars, decrypted
# server-side from the project's `project_secrets` row (ADR 004).
envsubst < /root/.pi/agent/models.json.template > /root/.pi/agent/models.json

# Clone every linked repo before Pi ever starts (ADR 006 item 6): the
# primary repo directly into /workspace, each sub-repo into
# /workspace/<repo-name>. TARGET_REPOS (JSON-encoded FeatureSpecRepo list)
# and GITHUB_TOKEN are only set for job kinds that need repos on disk
# (spec_grill today) — skip entirely if absent so this stays a no-op for any
# job kind that doesn't set them. A clone failure exits non-zero here (via
# `set -e` + node's own process.exit(1) on error), failing the job before
# Pi starts rather than handing an agent an empty/wrong workspace and
# letting it improvise its way to a wrong conclusion (verified against a
# real stuck run: an empty workspace led the agent to `git init` a fresh
# repo and plan to push to it, exactly the write access it doesn't have).
#
# Auth: the token is embedded in the clone URL only for the clone itself,
# then immediately stripped via `remote set-url` — nothing that later reads
# `.git/config` or runs `git remote -v` (including the agent itself, via its
# own shell tool) ever sees it.
#
# Uses node (already required for Pi) instead of adding a jq dependency.
if [ -n "${TARGET_REPOS:-}" ]; then
  node <<'NODE'
const { execFileSync } = require("node:child_process");

try {
  const repos = JSON.parse(process.env.TARGET_REPOS);
  const token = process.env.GITHUB_TOKEN;

  for (const repo of repos) {
    const authedUrl = repo.cloneUrl.replace(
      "https://",
      `https://x-access-token:${token}@`,
    );
    const repoName = repo.cloneUrl.replace(/\.git$/, "").split("/").pop();
    const dir = repo.isPrimary ? "/workspace" : `/workspace/${repoName}`;

    execFileSync("git", ["clone", authedUrl, dir], { stdio: "inherit" });
    execFileSync("git", ["-C", dir, "remote", "set-url", "origin", repo.cloneUrl], {
      stdio: "inherit",
    });
  }
} catch (err) {
  console.error("entrypoint: failed to clone target repos:", err.message);
  process.exit(1);
}
NODE
fi

# Pi doesn't auto-discover extensions dropped under ~/.pi/agent/extensions/ —
# it only loads what's registered via `pi install` or passed explicitly here.
# Without --extension, ask_user/submit_adr/etc. never reach the model's tool
# list regardless of which model is configured (verified against a real
# stuck run).
exec pi --mode rpc --extension /root/.pi/agent/extensions/yggdrasil-contract/src/index.ts "$@"
