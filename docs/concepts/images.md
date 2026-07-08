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
docker build -f base/Dockerfile -t <registry>/yggdrasil-agent-base:<tag> .
docker build -f spec_grill/Dockerfile --build-arg BASE_IMAGE=<registry>/yggdrasil-agent-base:<tag> \
  -t <registry>/yggdrasil-agent-spec-grill:<tag> .
# same pattern for feature_build/Dockerfile and test_run/Dockerfile
```

CI/release process (build, tag, push to the ADR 003 registry, and how the
Orchestrator's `SPEC_GRILL_IMAGE`/`FEATURE_BUILD_IMAGE`/`TEST_RUN_IMAGE` env
vars get bumped) is not yet implemented — see ADR 004's follow-ups.

## Why per-kind images instead of one shared image

`spec_grill` never launches a browser; `feature_build`/`test_run` need
Playwright's Chromium install (several hundred MB). Splitting keeps
`spec_grill` — the most frequent job kind — light, and keeps skills from being
visible to job kinds they don't belong to. See ADR 004's "Alternatives
considered" for the full reasoning.
