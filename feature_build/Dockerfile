# Build the base image first (../base/Dockerfile), then this one with:
#   docker build -f feature_build/Dockerfile --build-arg BASE_IMAGE=<base-tag> .
ARG BASE_IMAGE=yggdrasil-agent-images/base:latest
FROM ${BASE_IMAGE}

# Playwright + Chromium so the implement skill can self-verify UI changes
# before opening its draft PR (ADR 004). Extend to firefox/webkit later if a
# feature actually needs cross-browser verification during build.
RUN npx --yes playwright install --with-deps chromium

# gh CLI: the implement skill opens the draft PR itself.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

COPY feature_build/skills/implement /root/.pi/agent/skills/implement

WORKDIR /workspace
