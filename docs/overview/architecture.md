# Agent base container images — internal architecture

**Read this when:** you need to understand how this repo is structured internally
(image layers, key directories).
**Skip if:** you only need the suite-wide picture — see
`../../../docs/overview/architecture.md` in the meta repo, or the design
rationale in `../../../docs/adr/004-agent-base-containers.md`.

## Directory layout and build order

See `../concepts/images.md` — don't duplicate here.

## Skills and the shared extension

See `../concepts/skills.md` and `../concepts/contract-extension.md`.

## Model config

See `../concepts/model-config.md`.

## External dependencies

- Pi (pi.dev, `@earendil-works/pi-coding-agent`)
- Playwright CLI (`feature_build`, `test_run` images only)
- GitHub CLI (`gh`, `feature_build` only — the `implement` skill opens its own
  draft PR)
