---
name: project-init
description: The very first spec_grill run for a newly-created project — interview the user about what the project does, its tech stack, and how its linked repos relate, check the target repo(s) against Yggdrasil's structure standard, then submit an ADR describing what to scaffold or restructure. Use only when the initial prompt says this is a project_init run; use feature-grill for normal features.
allowed-tools: [ask_user, submit_adr]
---

# project-init

Every project's very first feature is `project_init` (ADR 002 §5-8) — it hard-gates
the project (no other features/tests can run) until its ADR is approved and
`feature_build` merges it. This skill is that grill session. It is **not** a
generic feature grill: `feature-grill` handles every other feature title; this
skill only ever runs once per project, and its job is narrower and more
prescriptive — establish what the project is, and bring its primary repo in
line with Yggdrasil's structure standard (`reference/structure-standard.md`).

If the initial prompt does not say this is a `project_init` run, stop — read
`feature-grill/SKILL.md` instead. Don't guess from the repo's contents alone.

## Ground yourself first

1. Read `reference/structure-standard.md` in this skill's own directory (not
   the target repo) — this is the checklist you grill against. It is shipped
   inside this image, not the target repo, so it's always available even for
   a repo that has never seen Yggdrasil before.
2. Explore each linked repo listed in the initial prompt read-only: does
   `docs/CONTEXT.md`/`docs/adr/`/`setup.sh`/`run.sh`/a Helm chart/`CLAUDE.md`
   already exist? Is there existing application code at all, or is this an
   empty/near-empty repo?
3. Use what you find to inform the interview below — don't ask the user
   something you can already see from the repo (e.g. don't ask "what
   language is this" if there's an obvious `package.json`/`go.mod`; ask to
   confirm/clarify instead, or skip straight past it).

## Interview loop

Ask **one question at a time** via the `ask_user` tool — never bundle
multiple questions into a single call, and never ask a question in plain text
outside the tool. For each question, propose a recommended answer and your
reasoning — the user is choosing between options you frame, not starting from
a blank page. Walk down this list one branch at a time; don't move on until
the current question is resolved. If a question is answerable by reading the
codebase instead of asking, read the codebase.

1. **What does the project do, and what does it achieve?** The actual
   product/purpose — not a restatement of the tech stack.
2. **What tech stack is used to build it?** Languages, frameworks, datastores,
   anything a `feature_build` agent will need to know to work in this repo.
   Confirm/refine what you already inferred from exploring, rather than
   re-asking from scratch if it's already obvious.
3. **Repo relationships.** The primary-vs-sub-repo split itself is already
   decided — it was fixed when this project was created, by the repo picker
   in the Web app (ADR 002 §2), and the initial prompt already lists each
   linked repo's role. **Don't re-ask "is this single-repo or multi-repo."**
   Instead: state back what you already know (list the linked repos and
   their roles), then ask the deeper question the repo picker doesn't answer
   — how do they actually relate at runtime? E.g. is a given sub-repo a
   library the primary imports at build time, or an independently-deployed
   service the primary calls over the network? This directly shapes the Helm
   chart and `run.sh`.
4. **Structure conformance.** For each gap you found in step 2 of "Ground
   yourself first" against `reference/structure-standard.md`, ask what's
   needed to close it — e.g. if there's no `run.sh` and the app needs three
   separate processes to come up together, ask how the user wants that
   expressed as one deterministic command, rather than guessing.
5. **If the repo already has non-conforming code:** don't ask a yes/no
   "should we restructure this?" — that duplicates the human-review gate
   already coming (`spec_ready` → review → Start build, ADR 002 §14). Do ask
   about the *specifics* of a restructuring plan where they're genuinely
   ambiguous (e.g. where an existing ad hoc script's logic should move to
   inside the new `setup.sh`/`run.sh` split).

## Read-only, always

This is a read-only exploration and interview session, full stop. **Never
modify anything in the cloned repo(s):** no file writes, no `git
init`/`add`/`commit`/`push`, no changing `git remote`, nothing. The GitHub
credential available in this container is scoped to read-only access
(ADR 005) — even if it weren't, this skill's job is to *propose* the plan,
not enact it. Everything this skill decides — including scaffolding
`docs/CONTEXT.md`, `setup.sh`, `run.sh`, the Helm chart, the `CLAUDE.md`
router, and wiring any sub-repos in as git submodules — is carried out later,
by a separate `feature_build` container with write access, from the ADR this
run submits. Nothing you decide here takes effect until that later run
happens and its PR is merged.

## Finishing

When every open question is resolved, call `submit_adr` **exactly once** with
the complete ADR. Unlike a normal feature's ADR, this one must explicitly
specify, as its Decision section:

- The answers to questions 1-3 above — this becomes the seed content for the
  target repo's own `docs/CONTEXT.md`.
- A `setup.sh` spec: what it does (env file generation, dependency install,
  seeding a database, etc.), or an explicit "not needed" if the project has
  nothing to bootstrap.
- A `run.sh` spec: the one deterministic command sequence that brings the app
  up locally.
- Confirmation the Helm chart exists (ADR 003 §12 already scaffolds this
  separately, on project creation) or, if missing, that it needs scaffolding
  here too.
- A `CLAUDE.md`/`AGENTS.md` router scaffold, mirroring
  yggdrasil-core's own `templates/child-repo/` pattern.
- If any linked sub-repos exist: a plan to wire each one in as a **git
  submodule** of the primary (`git submodule add <url> <path>`), not a
  sibling clone.
- If the repo already has non-conforming code: a concrete restructuring plan
  (what moves where), informed by the interview above.

This ends the run. Don't call any tool after `submit_adr`.
