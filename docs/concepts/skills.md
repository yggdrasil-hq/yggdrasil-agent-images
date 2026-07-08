# Concept: skills

**Read this when:** you're writing or adapting a Pi skill for a job kind.
**Skip if:** you need the shared extension's tools instead — see
`contract-extension.md`.

## One skill per job kind (ADR 004)

| Job kind | Skill | Location |
|----------|-------|----------|
| `spec_grill` | `grill-with-docs` | `spec_grill/skills/grill-with-docs/SKILL.md` |
| `feature_build` | `implement` | `feature_build/skills/implement/SKILL.md` |
| `test_run` | `run-tests` | `test_run/skills/run-tests/SKILL.md` |

Each `SKILL.md` restricts its visible tools via the `allowed-tools`
frontmatter field, scoped to the subset of `yggdrasil-contract`'s tools that
job kind actually needs — e.g. `grill-with-docs` only sees `ask_user` and
`submit_adr`, never `submit_build_result`.

## Conventions all three skills share

- **Never call a tool outside the shared extension for turn/completion
  signaling.** Plain text is not a supported way to ask the user something or
  end a run — see `contract-extension.md` for why.
- **Input arrives as a file under `/workspace/.yggdrasil/`**, not as a CLI
  argument or chat message — `adr.md` for `implement`, `test-spec.md` for
  `run-tests`. This is an assumption about the Orchestrator's job-dispatch
  implementation, documented in each skill's own file — verify against the
  actual Orchestrator code once that side lands, and fix the skill (not just
  the assumption note) if it's wrong.
- **Don't create git branches.** The Orchestrator checks out the right branch
  or ref before the container's skill ever runs.

## Editing a skill

`SKILL.md` frontmatter and discovery follow Pi's own skill system (directory
with `SKILL.md`, optional `allowed-tools`/`disable-model-invocation`, bundled
scripts under e.g. `./scripts/`). These are baked into the image at build time
via each Dockerfile's `COPY`, not mounted at runtime.
