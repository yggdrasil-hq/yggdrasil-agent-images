#!/bin/sh
set -eu

# Pi's own models.json only documents $VAR interpolation for the `apiKey`
# field, not `baseUrl`/model `id` — so this renders the whole file with
# envsubst instead of relying on Pi to do it. MODEL_BASE_URL / MODEL_API_KEY /
# MODEL_ID are injected by the Orchestrator as job-pod env vars, decrypted
# server-side from the project's `project_secrets` row (ADR 004).
envsubst < /root/.pi/agent/models.json.template > /root/.pi/agent/models.json

exec pi --mode rpc "$@"
