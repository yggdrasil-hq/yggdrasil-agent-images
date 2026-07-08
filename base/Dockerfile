# Common base for every job-kind image (ADR 004): Pi itself, the shared
# yggdrasil-contract extension, and the model config template. Per-job-kind
# Dockerfiles (../spec_grill, ../feature_build, ../test_run) build FROM this
# image's published tag — build and push this one first.
#
# Pi's installer requires Node.js >= 22.19 — node:20-slim is too old.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git openssh-client gettext-base \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://pi.dev/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Shared extension: structured tool calls (ask_user/submit_adr,
# submit_build_result, report_test_step/submit_test_report) in place of
# prose-based turn/completion signaling. Visibility per job kind is scoped by
# each skill's `allowed-tools` frontmatter, not by what's installed here.
COPY extensions/yggdrasil-contract /root/.pi/agent/extensions/yggdrasil-contract
RUN cd /root/.pi/agent/extensions/yggdrasil-contract && npm install --omit=dev

COPY models.json.template /root/.pi/agent/models.json.template
COPY base/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
