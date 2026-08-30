# Build the base image first (../base/Dockerfile), then this one with:
#   docker build -f design_grill/Dockerfile --build-arg BASE_IMAGE=<base-tag> .
ARG BASE_IMAGE=yggdrasil-agent-images/base:latest
FROM ${BASE_IMAGE}

# The design skill finalizes the branch by opening a draft PR.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

COPY design_grill/skills/design-grill /root/.pi/agent/skills/design-grill

WORKDIR /workspace
