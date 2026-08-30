# Build the base image first (../base/Dockerfile), then this one with:
#   docker build -f agentic_review/Dockerfile --build-arg BASE_IMAGE=<base-tag> .
ARG BASE_IMAGE=yggdrasil-agent-images/base:latest
FROM ${BASE_IMAGE}

# ADR 015 items 13-16 / Track B6: the read-only reviewer. Reuses the Pi
# attach/RPC machinery from base wholesale (same precedent design_grill set
# in ADR 014) and the shared yggdrasil-contract extension, whose new
# submit_review tool is exposed here. The review skill only reads a diff,
# never writes code or opens a PR — the Orchestrator mints a `contents: read`
# installation token for this kind (ADR 005 tier), so this image needs no
# extra write tooling (no Playwright, no gh CLI).
#
# No Playwright (nothing UI to launch) and no gh CLI (it must never create a
# real GitHub PR review). The single skill this image carries is `review`,
# whose allowed-tools is exactly [submit_review].
COPY agentic_review/skills/review /root/.pi/agent/skills/review

WORKDIR /workspace