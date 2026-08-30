# Build the script_test_run image directly (it does NOT layer on the Pi
# `base/` image). ADR 015 items 10-11 / Track B5: script_test_run is the
# deliberately non-agent job kind — there is no Pi, no skill, no attach/RPC,
# and no contract tool. It exists to run a deterministic test script from the
# project's own repo (the structure standard's optional `test-unit.sh` /
# `test-integration.sh`) and capture the result into the canonical
# `.yggdrasil/test-report.json`, which Yggdrasil alone reads (never the test
# framework's native output).
#
# This is the second non-agent job kind precedent (alongside `deploy`, which
# has no image here at all). A minimal Node base is enough — the runner
# below clones the primary repo and executes the scripts; no browser, no
# gh CLI, no Pi runtime.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

COPY script_test_run/entrypoint.sh /usr/local/bin/script-test-run-entrypoint.sh
RUN chmod +x /usr/local/bin/script-test-run-entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/script-test-run-entrypoint.sh"]