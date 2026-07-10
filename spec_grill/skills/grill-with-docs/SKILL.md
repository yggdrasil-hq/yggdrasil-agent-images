---
name: grill-with-docs
description: Interview the user about a new feature until reaching shared understanding, informed by this project's existing documentation (docs/CONTEXT.md, docs/adr/) and terminology, then submit the result as a structured ADR. Use at the start of a spec_grill run to turn a feature title into an implementation-ready spec.
allowed-tools: [ask_user, submit_adr]
---

# grill-with-docs

Adapted from Matt Pocock's `grill-with-docs` for Yggdrasil's `spec_grill` job
kind. The core method is unchanged — grill the plan against the project's own
documented terminology and prior decisions, resolving one open question at a
time — but the interaction and output contracts are different from the
original: this runs unattended inside an ephemeral container, so every
question and the final answer go through this repo's shared
`yggdrasil-contract` extension tools, not free text or direct file edits.

## Ground yourself first

1. Read `docs/CONTEXT.md` at the target repo's root, if it exists.
2. Read every file under `docs/adr/`, if that directory exists.
3. If neither exists: this project hasn't been through `project_init` yet, or
   `project_init` predates this convention. Proceed anyway, but say so in the
   final ADR's Context section — don't silently pretend a corpus exists that
   doesn't.

Use whatever you find to sharpen terminology and catch conflicts with prior
decisions, exactly as `grill-with-docs` does against this meta repo's own
`docs/`.

## Interview loop

1. Explore the target repo(s) enough to understand what the feature title
   implies touching.
2. Ask **one question at a time** via the `ask_user` tool — never bundle
   multiple questions into a single call, and never ask a question in plain
   text outside the tool (the Orchestrator only relays `ask_user` calls to the
   user; plain-text questions go nowhere).
3. For each question, propose a recommended answer and your reasoning, the
   same way `grill-with-docs` does — the user is choosing between options you
   frame, not starting from a blank page.
4. Walk down the design tree one branch at a time. Don't move to the next
   question until the current one is resolved.
5. If a question is answerable by reading the codebase instead of asking,
   read the codebase.

## Read-only, always

This is a read-only exploration and interview session, full stop — not just
for `docs/adr/`/`docs/CONTEXT.md`. **Never modify anything in the cloned
repo(s):** no file writes, no `git init`/`add`/`commit`/`push`, no changing
`git remote`, nothing. The GitHub credential available in this container is
scoped to read-only access (ADR 005) — even if it weren't, this skill's job
is to *propose* the plan, not enact it. If a repo can't be reached, or looks
wrong, or seems to need something scaffolded before you can proceed: **ask
the user via `ask_user`** (or note it in the ADR's Context section) — don't
work around it yourself (e.g. by initializing a fresh repo, or attempting to
clone/push with different credentials).

## Finishing

- Nothing is committed to git during `spec_grill` — the ADR only gets
  committed later, during `feature_build` (see ADR 002, ADR 004).
- When every open question is resolved, call `submit_adr` **exactly once**
  with the complete ADR (Context / Decision / Consequences / Alternatives
  considered — mirror the target repo's own ADR format if one exists from
  reading `docs/adr/`, otherwise use that same structure as a sane default).
- This ends the run. Don't call any tool after `submit_adr`.
