# Build the base image first (../base/Dockerfile), then this one with:
#   docker build -f test_run/Dockerfile --build-arg BASE_IMAGE=<base-tag> .
ARG BASE_IMAGE=yggdrasil-agent-images/base:latest
FROM ${BASE_IMAGE}

# Playwright + Chromium to drive the ephemeral preview URL and capture
# per-step screenshots/recordings (ADR 004, job-dispatch.md's test_run
# output contract).
#
# Installed as a real dependency of a fixed directory rather than via
# `npx --yes playwright install --with-deps chromium` (ADR 029). Two reasons,
# both of which the old form got wrong once recording entered the picture:
#
#  1. The browser version must match the library version. `npx --yes
#     playwright` resolves an ephemeral package that is thrown away, so the
#     downloaded browsers could drift from whatever `@playwright/test` a later
#     step pulled in — and the failure mode of a mismatch is a test run that
#     cannot launch a browser at all.
#  2. The test-runner *config* has to be able to `import { defineConfig } from
#     "@playwright/test"`, which requires the package to be resolvable from the
#     config's own location. Sitting the config next to an installed
#     node_modules is what makes that work without a NODE_PATH hack.
#
# Recording lives here rather than in the skill because `recordVideo` is a
# property of how a browser *context* is created, and the runner creates one for
# every test — there is no CLI flag that could turn it on after the fact. See
# playwright.config.ts.
WORKDIR /opt/playwright
RUN npm init -y >/dev/null \
    && npm install --no-fund --no-audit @playwright/test \
    && npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# The runner config, sited beside the installed package so its import resolves.
COPY test_run/playwright.config.ts /opt/playwright/playwright.config.ts

# One command for the skill: runs the browser checks, then surfaces whatever
# recording they produced (or nothing, when there was none — see the script).
COPY test_run/run-checks.sh test_run/collect-recording.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/run-checks.sh /usr/local/bin/collect-recording.sh

COPY test_run/skills/run-tests /root/.pi/agent/skills/run-tests

WORKDIR /workspace
