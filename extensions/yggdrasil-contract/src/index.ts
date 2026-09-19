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
      "reply back as the next prompt.\n" +
      "\n" +
      "**Pass `options` when the answer is a choice among a few things you " +
      "already know** — the user then picks instead of typing, and each option's " +
      "`description` explains it without a follow-up round trip. Passing " +
      "`options` makes `header` required: it is the short label above the " +
      "control (\"Database\"), where `question` is the sentence asking " +
      "(\"Which database should the API use?\"). Set `multiSelect: true` only " +
      "when several answers can be true at once.\n" +
      "\n" +
      "**Ask as prose — omit `options` — for anything open-ended** (\"what " +
      "problem does this solve?\", \"what should it NOT do?\"). The two modes " +
      "coexist deliberately: offering a closed list for an open question is " +
      "worse than asking it plainly, because it hides the options you did not " +
      "think of. Only offer a list when you would be content with every answer " +
      "coming from it.\n" +
      "\n" +
      "**Do not add an \"Other\" / \"Something else\" option yourself.** The chat " +
      "has a free-text box under every question, and the card says so — so the " +
      "escape hatch exists without you listing it, and listing it makes things " +
      "worse: a pick submits its *label as the answer*, so \"Other\" arrives as " +
      "the literal word and you learn nothing. If the honest framing is \"usually " +
      "one of these three, but it could be something I have not thought of\", " +
      "that is the prose case above — ask it plainly, or widen the list until " +
      "every option is one you would act on.\n" +
      "\n" +
      "Do not answer the question yourself, and do not proceed on an assumption " +
      "while you wait: this call is blocking, and a guess recorded here becomes an " +
      "approved decision the user never made.",
    parameters: Type.Object({
      question: Type.String({
        description: "The single question to ask the user.",
      }),
      header: Type.Optional(
        Type.String({
          description:
            "Short label naming what is being chosen, shown above the choices " +
            "(e.g. \"Database\"). Required when `options` is given.",
        }),
      ),
      multiSelect: Type.Optional(
        Type.Boolean({
          description:
            "True to let the user pick more than one option; false or omitted " +
            "for a single choice.",
        }),
      ),
      options: Type.Optional(
        Type.Array(
          Type.Object({
            label: Type.String({
              description: "What the user picks, in their words (e.g. \"PostgreSQL\").",
            }),
            description: Type.Optional(
              Type.String({
                description:
                  "One line on what this choice means, when the label alone " +
                  "does not say (e.g. \"Simplest for local development\").",
              }),
            ),
          }),
          {
            description:
              "The choices, when the answer is a choice. Omit entirely for a " +
              "free-text question.",
            minItems: 1,
          },
        ),
      ),
    }),
    async execute(_toolCallId, params) {
      /*
       * The one malformed shape a model actually produces: real choices with no
       * `header`. The API rejects it (`jobs/internal-routes.ts`), and a rejected
       * event post would be the worst outcome available here — the turn has
       * already ended, so the run would sit waiting for a reply to a question the
       * transcript never received.
       *
       * So the *tool* guarantees a valid event instead, by degrading to the prose
       * question it already knows how to ask: the choices are folded into the
       * question text so nothing the agent learned is lost, and the user answers
       * by typing. Nothing is invented and nothing stalls — which matters more
       * here than surfacing the mistake, because the person on the other end can
       * still answer.
       */
      const options = params.options ?? [];
      const structured = options.length > 0 && Boolean(params.header);

      if (structured) {
        return {
          content: [
            {
              type: "text",
              text:
                `${params.header}: ${params.question} ` +
                `(${options.map((option) => option.label).join(", ")})`,
            },
          ],
          details: {
            kind: "ask_user",
            question: params.question,
            header: params.header,
            // Absent resolves to false rather than staying undefined, so the
            // renderer never has to decide what a missing flag means.
            multiSelect: params.multiSelect ?? false,
            options,
          },
          terminate: true,
        };
      }

      const degraded =
        options.length > 0
          ? `${params.question}\n\nOptions you may pick from (reply with one) or answer freely:\n` +
            options
              .map((option) =>
                option.description
                  ? `- ${option.label} — ${option.description}`
                  : `- ${option.label}`,
              )
              .join("\n")
          : params.question;

      return {
        content: [{ type: "text", text: degraded }],
        details: { kind: "ask_user", question: degraded },
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
      "\u201cchanges_requested\u201d sends it back to Implementation). Ends the session.\n" +
      "\n" +
      "**Also populate `findings`, one entry per issue you found**, so the " +
      "reviewer sees *where* each problem is instead of reading an essay. " +
      "`comment` stays the summary; the list is the detail, and the two are " +
      "shown as one (a list when findings exist, the prose otherwise) — so do " +
      "not repeat yourself between them.\n" +
      "\n" +
      "Set `blocking` on every finding, explicitly. On a `changes_requested` " +
      "verdict the blocking ones are what Implementation is being sent back " +
      "for; on `approved`, list non-blocking suggestions with " +
      "`blocking: false` (holding a feature for a suggestion contradicts the " +
      "verdict you are submitting). An **omitted** `blocking` means blocking — " +
      "the choice is deliberately fail-closed, so leaving it off by accident " +
      "reports a suggestion as something that stopped the feature.\n" +
      "\n" +
      "`path` and `line` are optional and a finding may carry neither: a " +
      "remark about the change as a whole is a legitimate finding, and so is " +
      "one about a file the diff does not touch (a requirement implemented " +
      "nowhere). Do not invent a location to fill the field.\n" +
      "\n" +
      "Omit `findings` entirely only when you genuinely have nothing to list — " +
      "the difference between omitting it and passing an empty list is real " +
      "and preserved: omitting says \u201cI recorded no per-location findings\u201d and " +
      "an empty list says \u201cI looked and there were none\u201d. Prefer the empty " +
      "list when you did look, because only that state makes a \u201c0 blocking " +
      "issues\u201d claim true.",
    parameters: Type.Object({
      verdict: Type.Union([Type.Literal("approved"), Type.Literal("changes_requested")]),
      comment: Type.String({
        description:
          "A concise comment describing the findings. On changes_requested, describe " +
          "each blocking issue so Implementation knows what to fix.",
      }),
      /*
       * Issue #73: the structured half of a review, so a reviewer can see where
       * the problems are without reading a paragraph.
       *
       * **`blocking` is optional here on purpose, not by oversight.** The API
       * defaults an absent flag to `true` at ingest
       * (`api/src/jobs/internal-routes.ts`, `finding.blocking ?? true`) and
       * documents why: an omitted flag means "these are the blockers", and
       * defaulting to false would let a review pass its gate while displaying the
       * findings that should stop it. Two consequences make optional the right
       * shape rather than a required boolean:
       *
       * 1. A field with a documented server-side default is *optional by design*.
       *    Requiring it here would make that default unreachable from the only
       *    producer that exists, which is how a carefully-reasoned default
       *    silently rots.
       * 2. This call is terminal. A schema rejection means the tool never runs,
       *    so `terminate` never fires and the verdict has not been submitted; the
       *    run ends without one, which ADR 006 treats as a failure. That is a
       *    worse outcome than a finding being labelled blocking when it was not,
       *    and `blocking` gates nothing — the transition keys on `verdict` alone
       *    — so an omission costs display accuracy and cannot advance a broken
       *    feature.
       *
       * The description therefore asks for it *explicitly* instead, which is the
       * instruction the model actually follows.
       */
      findings: Type.Optional(
        Type.Array(
          Type.Object({
            path: Type.Optional(
              Type.String({
                maxLength: 512,
                description:
                  "Repository-relative path the finding is about. Omit when the " +
                  "finding is about the change as a whole.",
              }),
            ),
            /*
             * `Type.Integer`, unlike the `Type.Number` the test-report tool uses
             * for its counts. The API requires an integer here
             * (`z.number().int().positive()`), so a fractional line would be
             * accepted by the schema and then rejected at ingest — aborting the
             * event write on a path where that is silent and sticky (#86). The
             * strict shape belongs at the model, which can correct it.
             */
            line: Type.Optional(
              Type.Integer({
                minimum: 1,
                description:
                  "1-based line number within `path`, when the finding is about a " +
                  "specific line.",
              }),
            ),
            body: Type.String({
              minLength: 1,
              maxLength: 4000,
              description:
                "What is wrong, and what it should be instead — concrete enough " +
                "to act on without re-deriving it.",
            }),
            blocking: Type.Optional(
              Type.Boolean({
                description:
                  "Whether this must be fixed before the ADR can be called " +
                  "implemented. Set it on every finding; omitting it is treated " +
                  "as blocking.",
              }),
            ),
          }),
          {
            /*
             * Bounds mirror the API's exactly (`api/src/jobs/internal-routes.ts`:
             * `.max(50)`, `body` 1..4000, `path` ≤512). They live here as well as
             * there because a *tool-schema* rejection is recoverable — the tool
             * does not run, so nothing terminates and the model sees the error and
             * resubmits within the same turn — whereas an API rejection on this
             * path aborts the event write, and #86 showed what that looks like:
             * a completed job, a feature stuck, and nothing user-visible saying
             * why. Same reasoning as `options`'s `minItems: 1` just above.
             */
            description:
              "One entry per issue found, at most 50 — more than that is a " +
              "runaway rather than a review. Omit the whole array only when you " +
              "recorded no per-location findings.",
            maxItems: 50,
          },
        ),
      ),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Review: ${params.verdict}` }],
        // `...params` already carries `findings` when the model sent it and omits
        // the key entirely when it did not — which is the distinction the API
        // stores as `null` (prose) versus `[]` (structured, none). Nothing is
        // defaulted here, deliberately: materialising an empty array for an
        // omitted list would turn every prose review into a false "no findings"
        // claim, and materialising `blocking` would pre-empt the server's own
        // documented default.
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
