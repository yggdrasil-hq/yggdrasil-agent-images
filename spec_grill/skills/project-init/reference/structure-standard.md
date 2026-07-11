# Reference: Yggdrasil child-project structure standard

This is the checklist `project-init/SKILL.md` grills the target repo against.
It is bundled inside this image (not fetched from yggdrasil-core at runtime)
so it's always available regardless of network access — see ADR 008 item 6.
It mirrors yggdrasil-core's own conventions (`templates/child-repo/`,
`docs/conventions/repo-structure.md`) adapted for a single managed project
instead of a meta-repo-of-component-repos.

Every project's **primary repository** should have, after `project_init`
merges:

| Artifact | Purpose | Required? |
|---|---|---|
| `setup.sh` | Idempotent one-time environment setup: install deps, generate env files, seed a database, anything needed before the app can run. | Only if the project actually needs bootstrap/seed steps — omit if there's nothing to do. |
| `run.sh` | The single deterministic command that brings the app up locally. Not docker-compose — one script, whatever it needs to do internally (start containers, run dev servers, whatever fits the stack) to be a repeatable, one-command local run. | Always. |
| `docs/CONTEXT.md` | Living snapshot of decided-vs-open context for this project — same role as yggdrasil-core's own `docs/CONTEXT.md` (ADR 004 §14). | Always. |
| `docs/adr/` | Directory of accepted ADRs for this project, starting with `project_init`'s own ADR as `001-*.md`. | Always. |
| Helm chart | Scaffolded from Yggdrasil's strict template (ADR 003 §12) — describes the project's **hosting** topology (previews + the always-on primary deployment). This already gets scaffolded at project creation, separately from this grill session; project-init's job is to confirm it exists, not re-decide it. | Always (hosting only — never used for local dev). |
| `CLAUDE.md` + `AGENTS.md` | An agent router at the repo root, mirroring yggdrasil-core's own `templates/child-repo/CLAUDE.md`/`AGENTS.md` pattern: `CLAUDE.md` is the canonical router pointing into `docs/`, `AGENTS.md` is a thin pointer to it. | Always. |
| Sub-repos as git submodules | If the project has linked sub-repos (ADR 002 §2), they are wired as **git submodules** of the primary — not sibling clones — mirroring how yggdrasil-core itself nests its own component repos. | Whenever the project has any linked sub-repos. |

## What this standard is *not*

- **Not docker-compose.** `run.sh` is the one deterministic local-run entry
  point; it may do whatever it needs internally, but docker-compose itself is
  not the required mechanism.
- **Not a replacement for the Helm chart.** `setup.sh`/`run.sh` are strictly
  local-dev conventions. The Helm chart remains the Orchestrator's only
  hosting mechanism (ephemeral previews for `spec_grill`/`feature_build`/
  `test_run`, and the always-on primary deployment for prod — ADR 003
  §9-13). Never conflate the two, and never propose replacing the Helm chart
  with `run.sh` or vice versa.
- **Not asking "single repo or multi-repo."** That's already decided by the
  repo picker at project-creation time (ADR 002 §2) — this standard is about
  what the *primary repo's own tree* looks like once `project_init` is done,
  given whatever repos are already linked.

## Using this checklist

For each row, `project-init/SKILL.md` explores the target repo read-only to
see whether the artifact already exists and conforms. Gaps become either:

- Something to scaffold from scratch (empty/near-empty repo, or a repo that
  simply never had it), or
- Something to reconcile with existing, non-conforming code (e.g. the repo
  already has an ad hoc `dev.sh` that should become `run.sh`, or existing docs
  that should be reconciled with `docs/CONTEXT.md` rather than duplicated).

Either way, the resolution is written into the `project_init` ADR as a
concrete plan — never carried out during this read-only `spec_grill` session
itself (see `project-init/SKILL.md`'s "Read-only, always" section).
