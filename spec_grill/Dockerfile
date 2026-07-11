# Build the base image first (../base/Dockerfile), then this one with:
#   docker build -f spec_grill/Dockerfile --build-arg BASE_IMAGE=<base-tag> .
ARG BASE_IMAGE=yggdrasil-agent-images/base:latest
FROM ${BASE_IMAGE}

# No Playwright here — spec_grill only explores code and conducts the grill
# conversation; it never launches a browser. Keeps this the lightest image
# of the three (ADR 004).
#
# Two skills (ADR 008 items 2-5): the Orchestrator's initial prompt names
# exactly one of these per run (project-init for a project's very first
# spec_grill, feature-grill for every other feature) — never relies on the
# model inferring which applies from the feature title.
COPY spec_grill/skills/project-init /root/.pi/agent/skills/project-init
COPY spec_grill/skills/feature-grill /root/.pi/agent/skills/feature-grill

WORKDIR /workspace
