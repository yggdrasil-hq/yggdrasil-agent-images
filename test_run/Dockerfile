# Build the base image first (../base/Dockerfile), then this one with:
#   docker build -f test_run/Dockerfile --build-arg BASE_IMAGE=<base-tag> .
ARG BASE_IMAGE=yggdrasil-agent-images/base:latest
FROM ${BASE_IMAGE}

# Playwright + Chromium to drive the ephemeral preview URL and capture
# per-step screenshots/recordings (ADR 004, job-dispatch.md's test_run
# output contract).
RUN npx --yes playwright install --with-deps chromium

COPY test_run/skills/run-tests /root/.pi/agent/skills/run-tests

WORKDIR /workspace
