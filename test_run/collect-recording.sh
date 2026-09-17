#!/bin/sh
set -eu

# Surface the recording Playwright produced for a test_run's browser checks
# (ADR 029).
#
# Why this exists: the Playwright test runner writes one video per test, under a
# per-test directory, named after a content hash
# (`<outputDir>/<test-title>-<hash>/video.webm`). Nothing about that name is
# knowable in advance, so without collapsing it here the agent would have to
# guess a path — and a *guessed* path is exactly the failure this feature fixes.
# `recordingPath` has flowed agent -> API -> database since ADR 015 while
# pointing at a file that no longer existed by the time anyone read it.
#
# Contract, and the important half is the failure case:
#   - exactly one video found  -> copy it to the stable path below and print it
#   - no video found           -> print NOTHING, exit 0
#   - several found            -> pick the most recently modified, still print one
#
# Printing nothing on the empty case is deliberate. Callers must omit
# `recordingPath` from `submit_test_report` rather than report a path that does
# not exist, because a dead pointer is worse than an absent one: the API stores
# what it is given, and a stored path that resolves to nothing is what made the
# previous behaviour useless. Exit 0 either way, so a run with no browser
# subtasks does not fail here — this is a convenience, not a gate.

RECORDINGS_DIR="${PLAYWRIGHT_VIDEO_DIR:-/workspace/.yggdrasil/recordings}"
DEST="${RECORDING_OUTPUT:-/workspace/.yggdrasil/recording.webm}"

if [ ! -d "$RECORDINGS_DIR" ]; then
  exit 0
fi

# GNU find (-printf) — the image is Debian-based node:22-slim, so findutils is
# GNU. Sorted by mtime descending, so a re-run's newest artifact wins.
newest=$(
  find "$RECORDINGS_DIR" -type f -name '*.webm' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn \
    | head -n 1 \
    | cut -d' ' -f2-
)

if [ -z "$newest" ] || [ ! -f "$newest" ]; then
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
cp "$newest" "$DEST"
printf '%s\n' "$DEST"
