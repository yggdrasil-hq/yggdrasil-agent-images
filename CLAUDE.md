# CLAUDE.md — Agent base container images

> Canonical agent guide for this repo. `AGENTS.md` is a thin pointer to this
> file. This repo is a **git submodule** of the Yggdrasil meta repo.

## Context discipline (read first)

1. This router is short on purpose. Find your task in the routing table and open
   **only** the doc(s) it points to.
2. Each doc starts with `**Read this when:**` — use it to decide before reading.
3. For **suite-wide** context (product, architecture, glossary, cross-component
   contracts), don't restate it here — follow the up-links to the meta repo.

## What this repo is

Builds and publishes the container images the Orchestrator launches to run the
**Pi** coding agent (pi.dev) for each job kind. Build-time only — this repo has
no runtime service and the Orchestrator never calls it over the network; it
just resolves an image tag per job kind (see `SPEC_GRILL_IMAGE` /
`FEATURE_BUILD_IMAGE` / `TEST_RUN_IMAGE` in the Orchestrator's own config).

- **Role in Yggdrasil:** Agent base container images (Pi + skills + shared
  extension + model config template)
- **Stack:** Dockerfiles (one common base + one per job kind), Pi skills
  (`SKILL.md` directories), a shared TypeScript Pi extension
  (`yggdrasil-contract`)
- **Talks to:** Nothing at runtime. Consumed by the **Orchestrator**, which
  pulls the images this repo publishes to the container registry (ADR 003).

## Suite-wide context (up-links to the meta repo)

> These resolve when this repo is checked out inside the Yggdrasil meta repo.

- Product & scope: `../docs/overview/product.md`
- Architecture / data flow: `../docs/overview/architecture.md`
- Glossary: `../docs/overview/glossary.md`
- This component's bridge page: `../docs/components/agent-images.md`
- Rationale for this repo's design: `../docs/adr/004-agent-base-containers.md`
- The Pi agent concept: `../docs/concepts/pi-agent.md`
- Roadmap & open questions: `../docs/roadmap/`

## Routing table (this repo)

| If your task is about…                          | Read                              |
|--------------------------------------------------|------------------------------------|
| Orientation / how it's built                     | `docs/overview/architecture.md`   |
| Image layout (common base + per-job-kind images) | `docs/concepts/images.md`         |
| Skills (project-init, feature-grill, implement, run-tests) | `docs/concepts/skills.md` |
| The shared `yggdrasil-contract` extension        | `docs/concepts/contract-extension.md` |
| Model config template (`models.json`)            | `docs/concepts/model-config.md`   |
| Local dev / building images                      | `docs/overview/setup.md`          |
| Conventions specific to here                      | `docs/conventions/`               |

Full index: `docs/README.md`.

## Standing rules

- Keep docs in sync with code in the same change.
- One concern per doc; route, don't dump. (See the meta repo's
  `../docs/conventions/documentation-guide.md`.)
- Suite-wide facts live in the meta repo — link up, don't copy.
- **Status:** Dockerfiles, skills, and the shared extension are scaffolded and
  build cleanly (verified with local `docker build`). CI
  (`.github/workflows/build-images.yml`) builds and pushes all four images to
  `ghcr.io/yggdrasil-hq/yggdrasil-agent-images/*` on every push to `main` —
  see `docs/concepts/images.md`. Registry auth for self-hosted installs (GHCR
  packages default to private) is an open follow-up. See
  `../docs/adr/004-agent-base-containers.md`.
