# Concept: the `yggdrasil-contract` extension

**Read this when:** you're adding/changing a structured tool call, or need to
understand how a job kind signals "waiting for user" vs. "fully done."
**Skip if:** you only need to change skill instructions — see `skills.md`.

## Why this exists

Pi's RPC mode has no event distinguishing "the agent paused to wait for the
next user message" from "the agent is completely finished." Rather than
parsing prose for a sentinel (fragile, silently breaks if the model drifts),
every job kind ends its interaction/turns through an explicit tool call
(ADR 004). Source: `extensions/yggdrasil-contract/src/index.ts`.

## Tools

| Tool | Job kind | Ends the run? |
|------|----------|----------------|
| `ask_user(question)` | `spec_grill` | No — ends the *turn*; Orchestrator relays the question and feeds the reply back as the next prompt. |
| `submit_adr(markdown)` | `spec_grill` | Yes |
| `submit_build_result(status, prUrl?, summary)` | `feature_build` | Yes |
| `report_test_step(name, status, details?, screenshotPath?)` | `test_run` | No — called once per subtask |
| `submit_test_report(passed, failed, summary, recordingPath?)` | `test_run` | Yes |

"Ends the run" tools set `terminate: true` in their tool result, which tells
Pi to skip its automatic follow-up model call — the Orchestrator should treat
seeing one of these tool calls in the event stream as the authoritative
completion signal for that job, not `agent_end` alone.

## Visibility per image

The extension is installed in every image (common base layer,
`base/Dockerfile`), but each job kind's `SKILL.md` scopes which tools are
actually visible via `allowed-tools` — e.g. `feature_build`'s `implement`
skill never sees `ask_user`, because that job kind must run unattended
end-to-end.

## Open follow-ups

- The exact event schema the Orchestrator consumes from these tool calls
  (today they surface as standard Pi `tool_call`/`tool_result` events with a
  `details.kind` discriminator — whether the Orchestrator needs something
  more structured than that is TODO, see ADR 004 and `pi-agent.md`'s open
  RPC/SDK event taxonomy question).
- None currently — `typebox` is pinned to `1.1.38` in `package.json`, matching
  the exact version `@earendil-works/pi-coding-agent` itself depends on
  (checked via `npm view @earendil-works/pi-coding-agent dependencies`), to
  avoid a duplicate/mismatched copy at runtime. Re-check this pin whenever
  the base image's Pi version bumps.
