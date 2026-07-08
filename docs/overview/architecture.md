# Agent base container images — internal architecture

**Read this when:** you need to understand how this repo is structured internally
(image layers, key directories).
**Skip if:** you only need the suite-wide picture — see
`../../../docs/overview/architecture.md` in the meta repo, or the design
rationale in `../../../docs/adr/004-agent-base-containers.md`.

> TODO: fill in once the repo is scaffolded with real Dockerfiles/skills.

## Directory layout (planned, per ADR 004)

```
agent-images/
├── base/               common layer: Pi install + yggdrasil-contract extension
├── spec_grill/          Dockerfile + skills/grill-with-docs/
├── feature_build/        Dockerfile + skills/implement/ + Playwright
├── test_run/             Dockerfile + skills/run-tests/ + Playwright
└── models.json.template  env-var-interpolated model config
```

## Key modules / boundaries

> TODO — once the `yggdrasil-contract` extension exists, document its tool
> surface here (or in `docs/concepts/contract-extension.md`) rather than in
> the meta repo.

## External dependencies

- Pi (pi.dev, `@earendil-works/pi-coding-agent`)
- Playwright CLI (`feature_build`, `test_run` images only)
