# Build the base image first (../base/Dockerfile), then this one with:
#   docker build -f spec_grill/Dockerfile --build-arg BASE_IMAGE=<base-tag> .
ARG BASE_IMAGE=yggdrasil-agent-images/base:latest
FROM ${BASE_IMAGE}

# No Playwright here — spec_grill only explores code and conducts the grill
# conversation; it never launches a browser. Keeps this the lightest image
# of the three (ADR 004).
COPY spec_grill/skills/grill-with-docs /root/.pi/agent/skills/grill-with-docs

WORKDIR /workspace
