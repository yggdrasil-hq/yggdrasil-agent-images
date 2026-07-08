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

Per-project, not global (ADR 004): stored as encrypted rows in the API's
`project_secrets` table (reusing `api/src/secrets/encryption.ts`, AES-256-GCM
— the same mechanism used for other project env vars), decrypted server-side
when the API builds the job spec, and injected as plain env vars on the
ephemeral job PodSpec — the same delivery path already used for the scoped
GitHub token.

A `web/` settings page for editing these directly is a tracked follow-up;
today they're only reachable by writing `project_secrets` rows.
