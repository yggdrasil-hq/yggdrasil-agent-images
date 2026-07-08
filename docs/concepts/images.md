# Concept: image layout

**Read this when:** you're adding/changing a Dockerfile, or need to understand
the build order.
**Skip if:** you only need to edit a skill or the shared extension's tools —
see `skills.md` / `contract-extension.md` instead.

## Layout

```
agent-images/
├── base/                       common layer: Pi + yggdrasil-contract + models.json templating
│   ├── Dockerfile
│   └── entrypoint.sh
├── extensions/yggdrasil-contract/   the shared extension (see contract-extension.md)
├── models.json.template
├── spec_grill/Dockerfile        FROM base — grill-with-docs skill only, no Playwright
├── feature_build/Dockerfile     FROM base — implement skill + Playwright + gh CLI
└── test_run/Dockerfile          FROM base — run-tests skill + Playwright
```

No `deploy` image — that job kind runs `helm upgrade --install` directly
(ADR 003), it never runs Pi.

## Build order

`base/Dockerfile` must be built and tagged **before** any per-kind Dockerfile,
since they reference it via `--build-arg BASE_IMAGE=<tag>`:

```bash
docker build -f base/Dockerfile -t <registry>/base:<tag> .
docker build -f spec_grill/Dockerfile --build-arg BASE_IMAGE=<registry>/base:<tag> \
  -t <registry>/spec_grill:<tag> .
# same pattern for feature_build/Dockerfile and test_run/Dockerfile
```

## CI and registry

`.github/workflows/build-images.yml` builds all four images (in the order
above) on every push to `main` and on PRs (build-only, no push). Images are
tagged both `sha-<8-char-sha>` (immutable) and `latest`.

**Registry: GitHub Container Registry, not a per-install registry.** ADR 003's
bundled `registry:2` (self-hosted) and Yggdrasil-operated registry (managed)
are for **per-project app images** — built from a project's own Dockerfile,
living inside that install's own cluster/namespace. `agent-images` isn't
per-project; it's one shared, suite-maintained artifact every deployment
pulls the same version of, and centralized GitHub Actions CI has no network
path into a self-hosted customer's private cluster anyway. So this repo
publishes to `ghcr.io/yggdrasil-hq/yggdrasil-agent-images/{base,spec_grill,
feature_build,test_run}` instead, authenticated via `GITHUB_TOKEN` (no extra
secret) — every Orchestrator, self-hosted or managed, pulls directly from
there, bypassing its own local/per-install registry entirely for this
artifact.

The Orchestrator's `SPEC_GRILL_IMAGE`/`FEATURE_BUILD_IMAGE`/`TEST_RUN_IMAGE`
env vars are still bumped by hand (see `../../orchestrator/.env.example`) —
CI publishes new tags but nothing yet updates those env vars automatically.

### Open follow-up: registry auth for self-hosted installs

GHCR packages default to **private** on first push. A self-hosted
Orchestrator therefore needs a `read:packages`-scoped credential (a PAT or
GitHub App token) wired in as a Kubernetes image pull secret to actually pull
these images — that provisioning step (and whether to instead make the
packages public, given they contain no project-specific secrets, only the
shared agent runtime) is not yet designed.

## Why per-kind images instead of one shared image

`spec_grill` never launches a browser; `feature_build`/`test_run` need
Playwright's Chromium install (several hundred MB). Splitting keeps
`spec_grill` — the most frequent job kind — light, and keeps skills from being
visible to job kinds they don't belong to. See ADR 004's "Alternatives
considered" for the full reasoning.
