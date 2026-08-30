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

  // Four Action Item types, one per resolution mechanic (ADR 015 items 4-6).
  // `type` values match FeatureActionItemType in the API and the payloads
  // used by feature_build's request_action_item tool (Track B3).
  const actionItemTypes = Type.Union([
    Type.Literal("secret_request"),
    Type.Literal("design_grill"),
    Type.Literal("subtask_feature"),
    Type.Literal("test_request"),
  ]);
  const actionItem = Type.Object({
    type: actionItemTypes,
    description: Type.String({
      description: "What this item needs a human or another job to provide.",
    }),
    secretKey: Type.Optional(
      Type.String({ description: "The requested project secret or env-var key." }),
    ),
    draftTestMarkdown: Type.Optional(
      Type.String({ description: "The proposed markdown for a test_request item." }),
    ),
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
      "container down. Optionally include the batch of Action Items that " +
      "must be resolved before building (ADR 015 items 4-6): env var/secret " +
      "requests, moves to a design session, new blocking subtask features, " +
      "or test requests. Every item must be resolved before the human can " +
      "approve the build.",
    parameters: Type.Object({
      markdown: Type.String({
        description: "The complete ADR document, ready for human review.",
      }),
      actionItems: Type.Optional(
        Type.Array(actionItem, {
          description: "Optional Action Items that gate the build (ADR 015).",
        })
      ),
      hasDesignSurface: Type.Optional(
        Type.Boolean({
          description: "Whether the project has a web/mobile/user-facing interface.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: "ADR submitted." }],
        details: {
          kind: "submit_adr",
          markdown: params.markdown,
          ...(params.actionItems ? { actionItems: params.actionItems } : {}),
          ...(params.hasDesignSurface !== undefined
            ? { hasDesignSurface: params.hasDesignSurface }
            : {}),
        },
        terminate: true,
      };
    },
  });

  // ---- design_grill --------------------------------------------------

  const designSnapshot = Type.Record(Type.String(), Type.String(), {
    description: "Every file under designs/<slug>, keyed by relative path.",
  });

  pi.registerTool({
    name: "update_design_preview",
    label: "Update design preview",
    description:
      "Publish the complete current designs/<slug> file snapshot after " +
      "changing the mockup. This ends the current turn so the live preview " +
      "can refresh; it does not end the design session.",
    parameters: Type.Object({
      snapshot: designSnapshot,
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: "Design preview updated." }],
        details: { kind: "update_design_preview", snapshot: params.snapshot },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: "submit_design",
    label: "Submit design",
    description:
      "Submit the complete final designs/<slug> snapshot after committing " +
      "the design branch and opening its draft PR. Call exactly once to end " +
      "the design_grill session.",
    parameters: Type.Object({
      snapshot: designSnapshot,
      prUrl: Type.Optional(Type.String({ description: "Draft PR URL." })),
      summary: Type.String({ description: "Summary of the finalized design." }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: "Design submitted." }],
        details: { kind: "submit_design", ...params },
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

  // Blocked mid-build kickback (ADR 015 items 7-8, Track B3) — a terminal
  // call distinct from a generic crash/`submit_build_result success:false`.
  // Signals the Orchestrator to land the feature back in `draft` and
  // dispatch a context-seeded spec_grill rather than into `failed`.
  pi.registerTool({
    name: "request_action_item",
    label: "Request action item",
    description:
      "Report that implementation is blocked on something only a human or " +
      "another job can provide: a missing env var/secret, a dependency that " +
      "should be its own feature, a design decision that needs a design " +
      "session, or a test the build depends on. Call exactly once when the " +
      "feature is genuinely blocked for one of these reasons — NOT for a " +
      "generic crash or bug, which should instead call submit_build_result " +
      "with status \u201cfailure\u201d. Ends the session: the feature is sent back to " +
      "Spec with these needed items and a fresh, context-seeded grill runs.",
    parameters: Type.Object({
      actionItems: Type.Array(actionItem, {
        description:
          "One or more items only a human or another job can provide before " +
          "implementation can proceed.",
      }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [
          {
            type: "text",
            text: `Requested ${params.actionItems.length} action item(s): ${params.actionItems
              .map((item) => item.description)
              .join("; ")}`,
          },
        ],
        details: { kind: "request_action_item", actionItems: params.actionItems },
        terminate: true,
      };
    },
  });

  // ---- agentic_review (ADR 015 items 13-16, Track B6) -----------------

  pi.registerTool({
    name: "submit_review",
    label: "Submit review",
    description:
      "Submit the terminal verdict of an agentic review of a feature's " +
      "implementation diff: whether it actually implements the approved ADR. " +
      "Call exactly once, as the last action of an agentic_review run. This " +
      "is an internal Yggdrasil verdict, never a real GitHub PR review " +
      "(\u201capproved\u201d advances the feature to Manual Review; " +
      "\u201cchanges_requested\u201d sends it back to Implementation). Ends the session.",
    parameters: Type.Object({
      verdict: Type.Union([Type.Literal("approved"), Type.Literal("changes_requested")]),
      comment: Type.String({
        description:
          "A concise comment describing the findings. On changes_requested, describe " +
          "each blocking issue so Implementation knows what to fix.",
      }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Review: ${params.verdict}` }],
        details: { kind: "submit_review", ...params },
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
      passed: Type.Number({ minimum: 0 }),
      failed: Type.Number({ minimum: 0 }),
      skipped: Type.Optional(Type.Number({ minimum: 0 })),
      total: Type.Optional(Type.Number({ minimum: 0 })),
      coveragePercent: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
      failingTests: Type.Optional(Type.Array(Type.String())),
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
