import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Shared across every agent-images job kind (ADR 004). Each per-kind
 * SKILL.md restricts which of these tools are visible via `allowed-tools`,
 * so e.g. the spec_grill image never exposes submit_build_result.
 *
 * Every "final" tool here sets terminate: true — this tells Pi to skip its
 * automatic follow-up model call once the batch finishes, ending the turn
 * so the Orchestrator sees a clean stop instead of the agent continuing to
 * chatter after it has already reported its result.
 */
export default function (pi: ExtensionAPI) {
  // ---- spec_grill ---------------------------------------------------

  pi.registerTool({
    name: "ask_user",
    label: "Ask user",
    description:
      "Ask the human a single question during a grill session and wait for " +
      "their reply. Call this once per question, never bundle multiple " +
      "questions into one call. Ends the current turn: the Orchestrator " +
      "relays `question` to the user over the API/WebSocket and feeds their " +
      "reply back as the next prompt.",
    parameters: Type.Object({
      question: Type.String({
        description: "The single question to ask the user.",
      }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: params.question }],
        details: { kind: "ask_user", question: params.question },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: "submit_adr",
    label: "Submit ADR",
    description:
      "Submit the final ADR markdown once grilling is complete and every " +
      "open question has been resolved. Call exactly once, as the last " +
      "action of a spec_grill run. Ends the session: the Orchestrator " +
      "persists `markdown` on the feature record (nothing is committed to " +
      "git yet — that happens later, during feature_build) and tears the " +
      "container down.",
    parameters: Type.Object({
      markdown: Type.String({
        description: "The complete ADR document, ready for human review.",
      }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: "ADR submitted." }],
        details: { kind: "submit_adr", markdown: params.markdown },
        terminate: true,
      };
    },
  });

  // ---- feature_build --------------------------------------------------

  pi.registerTool({
    name: "submit_build_result",
    label: "Submit build result",
    description:
      "Report the outcome of a feature_build run. Call exactly once: after " +
      "opening the draft PR on success, or once you've concluded the " +
      "feature cannot be completed on failure. Ends the session.",
    parameters: Type.Object({
      status: Type.Union([Type.Literal("success"), Type.Literal("failure")]),
      prUrl: Type.Optional(
        Type.String({ description: "Draft PR URL. Required if status is success." })
      ),
      summary: Type.String({
        description: "One paragraph describing what was built, or why it failed.",
      }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Build result: ${params.status}` }],
        details: { kind: "submit_build_result", ...params },
        terminate: true,
      };
    },
  });

  // ---- test_run ------------------------------------------------------

  pi.registerTool({
    name: "report_test_step",
    label: "Report test step",
    description:
      "Report the pass/fail result of one `##` subtask from the test " +
      "markdown spec. Call once per subtask, in the order the spec lists " +
      "them, immediately after finishing each one — do not batch multiple " +
      "subtasks into one call. This does not end the run; keep going to the " +
      "next subtask.",
    parameters: Type.Object({
      name: Type.String({ description: "The subtask's `##` heading text." }),
      status: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
      details: Type.Optional(
        Type.String({ description: "What happened, especially on failure." })
      ),
      screenshotPath: Type.Optional(
        Type.String({ description: "Path to a screenshot artifact, if captured." })
      ),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `${params.name}: ${params.status}` }],
        details: { kind: "report_test_step", ...params },
      };
    },
  });

  pi.registerTool({
    name: "submit_test_report",
    label: "Submit test report",
    description:
      "Submit the final aggregate test report once every subtask has been " +
      "run and reported via report_test_step. Call exactly once, as the " +
      "last action of a test_run. Ends the session.",
    parameters: Type.Object({
      passed: Type.Number(),
      failed: Type.Number(),
      summary: Type.String(),
      recordingPath: Type.Optional(
        Type.String({ description: "Path to a screen recording artifact, if captured." })
      ),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [
          {
            type: "text",
            text: `Test run complete: ${params.passed} passed, ${params.failed} failed.`,
          },
        ],
        details: { kind: "submit_test_report", ...params },
        terminate: true,
      };
    },
  });
}
