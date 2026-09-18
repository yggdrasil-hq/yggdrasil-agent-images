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
│   ├── entrypoint.sh
│   └── pi-with-extensions.mjs  runs Pi with any bundle the project opted into (ADR 025)
├── extensions/yggdrasil-contract/   the shared extension (see contract-extension.md)
├── models.json.template
├── spec_grill/Dockerfile        FROM base — project-init + feature-grill skills, no Playwright
├── feature_build/Dockerfile     FROM base — implement skill + Playwright + gh CLI
├── test_run/Dockerfile          FROM base — run-tests skill + Playwright
├── agentic_review/Dockerfile    FROM base — review skill, no Playwright/gh (read-only diff review)
├── design_grill/Dockerfile      FROM base — design-grill skill + gh CLI
└── script_test_run/Dockerfile   standalone (non-Pi) — plain test runner, no Pi/skill/extension
```

No `deploy` image — that job kind runs `helm upgrade --install` directly
(ADR 003), it never runs Pi. `script_test_run` is the second non-agent job
kind (ADR 015): it also never runs Pi, so unlike every other image here it
does **not** build `FROM base` — it is a minimal standalone container that
runs the project's `test-unit.sh`/`test-integration.sh` (see its own
`entrypoint.sh`).

## Build order

`base/Dockerfile` must be built and tagged **before** any per-kind Dockerfile,
since they reference it via `--build-arg BASE_IMAGE=<tag>` (`script_test_run`
is the exception — it builds standalone and has no `BASE_IMAGE` arg):

```bash
docker build -f base/Dockerfile -t <registry>/base:<tag> .
docker build -f spec_grill/Dockerfile --build-arg BASE_IMAGE=<registry>/base:<tag> \
  -t <registry>/spec_grill:<tag> .
# same pattern for feature_build/Dockerfile, test_run/Dockerfile,
# agentic_review/Dockerfile, and design_grill/Dockerfile
# agentic_review/Dockerfile
docker build -f script_test_run/Dockerfile -t <registry>/script_test_run:<tag> .
```

## CI and registry

`.github/workflows/build-images.yml` builds all seven images on every push to
`main` and on PRs (build-only, no push). Images are tagged both `sha-<8-char-sha>`
(immutable) and `latest`.

**Registry: GitHub Container Registry, not a per-install registry.** ADR 003's
bundled `registry:2` (self-hosted) and Yggdrasil-operated registry (managed)
are for **per-project app images** — built from a project's own Dockerfile,
living inside that install's own cluster/namespace. `agent-images` isn't
per-project; it's one shared, suite-maintained artifact every deployment
pulls the same version of, and centralized GitHub Actions CI has no network
path into a self-hosted customer's private cluster anyway. So this repo
publishes to `ghcr.io/yggdrasil-hq/yggdrasil-agent-images/{base,spec_grill,
feature_build,test_run,agentic_review,design_grill,script_test_run}` instead, authenticated
via `GITHUB_TOKEN` (no extra secret) — every Orchestrator, self-hosted or
managed, pulls directly from there, bypassing its own local/per-install
registry entirely for this artifact.

The Orchestrator's `SPEC_GRILL_IMAGE`/`FEATURE_BUILD_IMAGE`/`TEST_RUN_IMAGE`/
`AGENTIC_REVIEW_IMAGE`/`DESIGN_GRILL_IMAGE`/`SCRIPT_TEST_RUN_IMAGE` env vars are still bumped by
hand (see `../../orchestrator/.env.example`) — CI publishes new tags but
nothing yet updates those env vars automatically.

### Registry auth for self-hosted installs

GHCR packages are **private on first push**, and visibility is per *package*, not
per repository: as of this writing `test_run` refuses an anonymous pull while
`spec_grill`, `feature_build`, `script_test_run`, `agentic_review` and
`design_grill` allow one. Which ones need a credential is therefore a property of
the registry at the moment of asking, not something to assume — a self-hosted
Orchestrator asks the registry rather than guessing from the `ghcr.io` host
(doing the latter would warn about five packages that do not need help, which is
how a useful warning gets ignored).

The fix is one of two things, and both are supported:

- **Make the package public.** These images contain no project-specific secrets —
only the shared agent runtime and skills — so this is a legitimate answer for a
project that would rather not manage a credential. It is a per-package setting in
the GitHub UI; nothing in this repo changes.
- **Give the cluster a `read:packages`-scoped credential** (a PAT or GitHub App
token) as a Kubernetes docker-config object, and reference it from the pods —
the Orchestrator's `JOB_IMAGE_PULL_SECRET`, or the project namespace's `default`
service account. `orchestrator/docs/overview/setup.md` has the commands.

What is still not automated: nothing provisions that credential for you, and
nothing flips a package's visibility. Both are one-time operator actions rather
than things the suite can do on its own (it has no GHCR administration access),
which is why the failure is reported with the remedy spelled out instead.

## Why per-kind images instead of one shared image

`spec_grill` never launches a browser; `feature_build`/`test_run` need
Playwright's Chromium install (several hundred MB). Splitting keeps
`spec_grill` — the most frequent job kind — light, and keeps skills from being
visible to job kinds they don't belong to. See ADR 004's "Alternatives
considered" for the full reasoning.

## Screen recording (`test_run`, ADR 029)

`test_run` ships a Playwright test-runner config with video recording enabled,
because `recordVideo` is a property of how a browser *context* is created and
the runner creates one per test — no CLI flag can turn it on after the fact.
That is also why `@playwright/test` is installed as a real dependency of
`/opt/playwright` rather than being pulled ephemerally by `npx playwright
install`: the config has to be able to import it, and the browser build must
match the library build.

The runner writes one video per test under a hashed per-test directory.
`collect-recording.sh` collapses that to one stable path
(`/workspace/.yggdrasil/recording.webm`), and `run-checks.sh` runs the checks
and reports it. Both print **nothing** when no recording exists, deliberately:
the skill must omit `recordingPath` rather than report a dead path, since a
stored pointer that cannot be opened is worse than an absent one.

Recording is best-effort end to end. `feature_build` ships Playwright too and
may record, but nothing surfaces a build's recording yet.
