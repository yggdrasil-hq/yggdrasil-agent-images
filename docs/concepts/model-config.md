# Concept: model configuration

**Read this when:** you're touching `models.json.template`, the entrypoint's
templating step, or how a project's model gets into a job container.

## Shape

OpenAI-chat-completions-compatible only, for now (ADR 004) — one custom
provider named `project` in `models.json`, reading three env vars at
container start:

- `MODEL_BASE_URL`
- `MODEL_API_KEY`
- `MODEL_ID`

See `models.json.template` and `base/entrypoint.sh`.

## Why templated via `envsubst`, not Pi's own `$VAR` interpolation

Pi's `models.json` only documents `$VAR`/`!shell` interpolation for the
`apiKey` field specifically — `baseUrl` and a model's `id` aren't confirmed to
support the same syntax. Rather than rely on undocumented behavior,
`entrypoint.sh` renders the whole template with `envsubst` into the real
`~/.pi/agent/models.json` before `exec`-ing `pi`. If a future Pi version
documents interpolation for those fields too, this template could drop back
to relying on Pi natively — not urgent to change either way.

## Where the values come from

Stored as encrypted rows (reusing `api/src/secrets/encryption.ts`,
AES-256-GCM — the same mechanism used for other project env vars), decrypted
server-side when the API builds the job spec, and injected as plain env vars
on the ephemeral job PodSpec — the same delivery path already used for the
scoped GitHub token.

Originally per-project only (ADR 004). **Per ADR 007**
(`../../../docs/adr/007-per-user-default-model-configuration.md`), resolution
is now a **live fallback at every dispatch site**: the project's own
`project_secrets` row is checked first, then the owning user's
`user_secrets` default — not a snapshot copied at project creation. The
three env vars are an all-or-nothing bundle at each level: a project has
none of them set (fully inherits the user default) or all three (fully
custom). Every dispatch site refuses to dispatch if neither level resolves.

A `web/` settings UI exists for both levels (account default and per-project
override) — no longer only reachable by writing `project_secrets`/
`user_secrets` rows directly.
