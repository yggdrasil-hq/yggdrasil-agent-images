#!/bin/sh
set -eu

# Pi's own models.json only documents $VAR interpolation for the `apiKey`
# field, not `baseUrl`/model `id` — so this renders the whole file with
# envsubst instead of relying on Pi to do it. MODEL_BASE_URL / MODEL_API_KEY /
# MODEL_ID are injected by the Orchestrator as job-pod env vars, decrypted
# server-side from the project's `project_secrets` row (ADR 004).
envsubst < /root/.pi/agent/models.json.template > /root/.pi/agent/models.json

# Pi doesn't auto-discover extensions dropped under ~/.pi/agent/extensions/ —
# it only loads what's registered via `pi install` or passed explicitly here.
# Without --extension, ask_user/submit_adr/etc. never reach the model's tool
# list regardless of which model is configured (verified against a real
# stuck run).
exec pi --mode rpc --extension /root/.pi/agent/extensions/yggdrasil-contract/src/index.ts "$@"
