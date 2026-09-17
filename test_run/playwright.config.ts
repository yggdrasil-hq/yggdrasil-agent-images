# Playwright configuration for the test_run image (ADR 029).
#
# The run-tests skill drives browser checks through the Playwright *test
# runner* rather than ad-hoc CLI calls, because that is the only place a video
# can be turned on: `playwright screenshot`/`codegen` take no recording option,
# and `recordVideo` is a property of how a browser *context* is created. The
# runner creates the context for every test, so configuring it here is what
# makes a recording exist at all — there is no flag the skill could pass to a
# CLI command to get one.
#
# `outputDir` is fixed rather than defaulted (`test-results/`) so the artifact
# has one predictable home inside the ephemeral workspace, which is what lets
# the Orchestrator collect it and what the skill reports back. Everything under
# .yggdrasil/ is the workspace's own scratch area, matching where the test spec
# and the ADR already live; nothing here is committed.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "/workspace/.yggdrasil/checks",
  outputDir: "/workspace/.yggdrasil/recordings",
  // One worker, no parallelism: this runs inside a small ephemeral job pod with
  // a single Chromium install, and concurrent browser contexts competing for
  // CPU would make recorded video drop frames — the artifact's whole value is
  // showing what actually happened.
  workers: 1,
  fullyParallel: false,
  // No retries. A retried test would leave two recordings for one subtask and
  // hide a flaky failure behind a pass, which is the opposite of what a
  // verification run should report.
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: process.env.PREVIEW_URL,
    // The recording itself (ADR 029). `on` rather than `retain-on-failure`:
    // a passing run's recording is the evidence that the subtask really did what
    // it claimed, and it is the failure case that is already well served by a
    // screenshot.
    video: { mode: "on" },
    // Screenshots stay off by default here — the skill decides when one is
    // worth taking (a UI-visible subtask, or a failure), and a fixed
    // screenshot-on-every-test setting would neither match that judgement nor
    // stay in step with `report_test_step`'s own screenshotPath.
    screenshot: "off",
    // Headless: the pod has no display. Playwright's video recording does not
    // need one — it captures the browser's compositor output, not a screen.
    headless: true,
    // A hung navigation must not hold the job open indefinitely; the
    // Orchestrator's own per-job ceiling is the outer bound, this is the inner
    // one that produces a usable failure instead of a timeout with no detail.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
