#!/usr/bin/env node
/**
 * Verify the `yggdrasil-contract` tools, and check that the fields they emit are
 * actually readable by every hop downstream.
 *
 * **Why this exists.** This repo has no test harness, and the extension cannot be
 * exercised by running a job — no agent job has ever completed in this
 * environment (see issues #19/#71). So a change to a tool's shape used to be
 * verified by reading it, which is how a field can be added, emitted, and
 * discarded in transit while everything looks finished.
 *
 * That failure has happened here three times, which is what justifies a check
 * rather than care:
 *
 * 1. **#38** — `ask_user` emitted `header`/`multiSelect`/`options` and the
 *    Orchestrator dropped all three, twice: `rpc.Translate`'s `CuratedEvent`
 *    literal named only `Question`, and `apiclient`'s `jobEventRequest` is an
 *    explicit field list.
 * 2. **#59** — `submit_review`'s verdict was validated, acted on, and then
 *    discarded because the repository's `create` never declared it.
 * 3. **#73** — `submit_review`'s `findings`, which is the same shape again.
 *
 * A field that is declared, marshalled and discarded looks exactly like a field
 * that works, from inside this repo. So this script reports **which hop drops
 * each field**, rather than trusting that the tool emitting it is enough.
 *
 * ## What it does
 *
 * 1. **Registers the real extension** against a stub `pi`, so the assertions are
 *    about the object Pi is actually handed — not about the source text.
 * 2. **Asserts each tool's parameter names**, so a rename is caught here rather
 *    than as a silently-ignored field at runtime.
 * 3. **Drives `execute()`** for the shapes whose *difference* is load-bearing —
 *    for `submit_review`: an omitted list versus an empty one, and an explicit
 *    `blocking` versus an absent one. Those distinctions are the whole of #73;
 *    a check that only asserted "findings come through" would miss both.
 * 4. **Reconciles the field names across all three hops** — tool → Orchestrator
 *    `Translate` → Orchestrator `jobEventRequest` → API zod — and prints where
 *    each field stops being readable.
 *
 * ## Running it
 *
 * The extension needs `typebox` at runtime and this sandbox cannot `npm install`,
 * so the check runs against a **staged copy** of the extension plus a
 * `node_modules` taken from the base image's own build. Staging is what lets
 * `node_modules` be a sibling of `src/`, which is how module resolution finds it;
 * mounting into the image's `/root` (where the real extension lives) is refused by
 * this sandbox's file guard.
 *
 *   STAGE=/tmp/contract-verify
 *   mkdir -p "$STAGE/extensions/yggdrasil-contract"
 *   cp -r extensions/yggdrasil-contract/src "$STAGE/extensions/yggdrasil-contract/src"
 *   cp -r scripts "$STAGE/scripts"
 *   # `node_modules` from the base image (the exact `typebox` the images ship):
 *   CID=$(docker create yggdrasil-agent-images/base:local)
 *   docker cp "$CID:/root/.pi/agent/extensions/yggdrasil-contract/node_modules" \
 *     "$STAGE/extensions/yggdrasil-contract/node_modules"
 *   docker rm "$CID"
 *
 *   docker run --rm --entrypoint node \
 *     -v "$STAGE":/run:ro \
 *     -v "$PWD/..":/meta:ro \
 *     -e META_REPO=/meta \
 *     -w /run \
 *     yggdrasil-agent-images/base:local \
 *     /run/scripts/verify-contract-tools.ts
 *
 * `--entrypoint node` is required — the base image's own entrypoint would receive
 * the script path as an argument and run nothing, which looks like a silent pass.
 *
 * A local run (`node scripts/verify-contract-tools.ts` from the repo root) also
 * works if `extensions/yggdrasil-contract/node_modules` exists; `CONTRACT_EXTENSION_ENTRY`
 * and `META_REPO` are how the same file serves both.
 *
 * ## Verified by mutation, not only by passing
 *
 * A check that cannot fail is worse than no check, so each half was confirmed to
 * bite:
 *
 *   - removing `findings` from the schema -> **8 failures**, each naming a gap;
 *   - defaulting an omitted `findings` to `[]` and an omitted `blocking` to `true`
 *     -> **3 failures**, exactly the checks written for those two distinctions;
 *   - simulating the three missing Orchestrator edits -> the cross-repo report
 *     goes from **1 failure to 0**, so it will confirm the fix rather than always
 *     complaining.
 *
 * ## What this does not do
 *
 * The **cross-repo reconciliation is regex-based** over Go struct tags, Go
 * literal fields and zod keys. It is a heuristic that catches this class of
 * omission, not a typecheck. It needs the alias table below to stay accurate, and
 * a false alarm here is worse than useless — a check that cries wolf gets ignored
 * and is then worth nothing on the day it is right (the lesson behind #83). Every
 * false positive found while writing it was removed rather than tolerated, which
 * is why the real report is a single line.
 *
 * It also cannot tell you whether Pi's tool schema induces a **model** to use a
 * field; only a real run can, and none has completed in this environment
 * (#19/#71).
 */
import { readFileSync } from "node:fs";

/** Where the built extension lives inside the image, and in a local checkout. */
const EXTENSION_ENTRY =
  process.env.CONTRACT_EXTENSION_ENTRY ?? "../extensions/yggdrasil-contract/src/index.ts";

/** The meta repo root, for the cross-repo hop check. */
const META_REPO = process.env.META_REPO ?? "..";

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = ""): void {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

// ---------------------------------------------------------------------------
// 1. Load the real extension against a stub `pi`
// ---------------------------------------------------------------------------

interface RegisteredTool {
  name: string;
  description: string;
  parameters: { properties?: Record<string, unknown>; required?: string[] };
  execute: (id: string, params: Record<string, unknown>) => Promise<{
    content: unknown;
    details: Record<string, unknown>;
    terminate?: boolean;
  }>;
}

const tools = new Map<string, RegisteredTool>();

const stubPi = {
  registerTool(tool: RegisteredTool) {
    tools.set(tool.name, tool);
  },
  // The extension only registers tools today. If it starts registering commands,
  // events or providers, those calls should fail loudly here rather than being
  // silently swallowed by a permissive stub.
  registerCommand(name: string) {
    throw new Error(`unexpected registerCommand(${name}) — extend this stub`);
  },
  on(event: string) {
    throw new Error(`unexpected on(${event}) — extend this stub`);
  },
};

const extension = (await import(EXTENSION_ENTRY)) as {
  default: (pi: unknown) => void;
};

extension.default(stubPi);

const EXPECTED_TOOLS = [
  "ask_user",
  "submit_adr",
  "update_design_preview",
  "submit_design",
  "submit_build_result",
  "request_action_item",
  "submit_review",
  "report_test_step",
  "submit_test_report",
];

section("registration");
check(
  `all ${EXPECTED_TOOLS.length} tools register`,
  EXPECTED_TOOLS.every((name) => tools.has(name)),
  EXPECTED_TOOLS.filter((name) => !tools.has(name)).join(", ") || "none missing",
);
check(
  "no unexpected tools",
  [...tools.keys()].every((name) => EXPECTED_TOOLS.includes(name)),
  [...tools.keys()].filter((name) => !EXPECTED_TOOLS.includes(name)).join(", ") || "none extra",
);
// A terminal tool without `terminate` would leave the Orchestrator waiting for a
// follow-up model call that never ends the turn (ADR 004's whole mechanism).
for (const name of ["submit_adr", "submit_review", "submit_design", "submit_build_result", "request_action_item", "submit_test_report"]) {
  const tool = tools.get(name);
  if (!tool) continue;
  const result = await tool.execute("probe", probeParamsFor(name));
  check(`${name} terminates the run`, result.terminate === true);
}

// A minimal valid input per tool, so `terminate` can be observed without a model.
function probeParamsFor(name: string): Record<string, unknown> {
  switch (name) {
    case "submit_adr":
      return { markdown: "# ADR" };
    case "submit_review":
      return { verdict: "approved", comment: "ok" };
    case "submit_design":
      return { snapshot: { "page.html": "<html></html>" } };
    case "submit_build_result":
      return { status: "success" };
    case "request_action_item":
      return { actionItems: [{ type: "secret_request", description: "need a key" }] };
    case "submit_test_report":
      return { passed: 1, failed: 0, summary: "ok" };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// 2. Parameter names — a rename is silent at runtime
// ---------------------------------------------------------------------------

section("parameter names");
const EXPECTED_PARAMS: Record<string, string[]> = {
  ask_user: ["question", "header", "multiSelect", "options"],
  submit_adr: ["markdown", "actionItems"],
  submit_review: ["verdict", "comment", "findings"],
  report_test_step: ["name", "status", "details", "screenshotPath"],
  submit_test_report: [
    "passed",
    "failed",
    "skipped",
    "total",
    "coveragePercent",
    "failingTests",
    "summary",
    "recordingPath",
  ],
  update_design_preview: ["snapshot"],
  submit_design: ["snapshot", "prUrl", "summary"],
  submit_build_result: ["status", "prUrl", "summary"],
  request_action_item: ["actionItems"],
};

for (const [name, expected] of Object.entries(EXPECTED_PARAMS)) {
  const actual = Object.keys(tools.get(name)?.parameters.properties ?? {});
  check(
    `${name} declares ${expected.join(", ")}`,
    expected.every((param) => actual.includes(param)),
    actual.join(", "),
  );
}

// ---------------------------------------------------------------------------
// 3. `submit_review`'s findings — the shapes whose difference is the feature
// ---------------------------------------------------------------------------

section("submit_review findings");
const review = tools.get("submit_review")!;
const findingsSchema = (review.parameters.properties as Record<string, { items?: { properties?: Record<string, { maxLength?: number; maxItems?: number; minimum?: number; type?: string }>; required?: string[] }; maxItems?: number }>)
  .findings;

check("findings is declared", Boolean(findingsSchema));
check("findings is bounded at 50", findingsSchema?.maxItems === 50, String(findingsSchema?.maxItems));
const findingProps = findingsSchema?.items?.properties ?? {};
check(
  "a finding declares path, line, body, blocking",
  ["path", "line", "body", "blocking"].every((key) => key in findingProps),
  Object.keys(findingProps).join(", "),
);
// The API requires `body` (1..4000) and an *integer* line; declaring looser types
// here would let a model send a shape that is accepted locally and rejected at
// ingest — where a rejection aborts the event write silently (#86).
check(
  "body is required",
  (findingsSchema?.items?.required ?? []).includes("body"),
  (findingsSchema?.items?.required ?? []).join(", "),
);
check("body is bounded to 4000", findingProps.body?.maxLength === 4000, String(findingProps.body?.maxLength));
check("path is bounded to 512", findingProps.path?.maxLength === 512, String(findingProps.path?.maxLength));
check(
  "line is an integer",
  findingProps.line?.type === "integer",
  String(findingProps.line?.type),
);
// `blocking` must NOT be required: the API documents a default at ingest, and a
// schema rejection on a terminal tool would lose the verdict entirely.
check(
  "blocking is optional",
  !(findingsSchema?.items?.required ?? []).includes("blocking"),
);

async function reviewDetails(params: Record<string, unknown>) {
  return (await review.execute("probe", params)).details;
}

// The three distinctions that make #73 work. Each is asserted because collapsing
// any of them changes what the reviewer sees:
//   omitted list  -> `findings` ABSENT  -> API stores NULL -> count unknowable
//   empty list    -> `findings: []`     -> API stores []   -> count is truly zero
//   omitted flag  -> `blocking` ABSENT  -> API's `?? true` applies
const omitted = await reviewDetails({ verdict: "changes_requested", comment: "one thing" });
check(
  "an omitted findings list sends no key",
  !("findings" in omitted),
  Object.keys(omitted).join(", "),
);
check(
  "…so the API reads it as prose",
  omitted.findings === undefined,
);

const empty = await reviewDetails({ verdict: "approved", comment: "fine", findings: [] });
check("an empty findings list is carried as []", Array.isArray(empty.findings) && empty.findings.length === 0);

const explicit = await reviewDetails({
  verdict: "changes_requested",
  comment: "one thing",
  findings: [
    { path: "src/a.ts", line: 12, body: "missing guard", blocking: true },
    { body: "nit: naming", blocking: false },
  ],
});
const findings = explicit.findings as Array<Record<string, unknown>>;
check("explicit blocking values survive", findings?.[0]?.blocking === true && findings?.[1]?.blocking === false);

const implicit = await reviewDetails({
  verdict: "changes_requested",
  comment: "one thing",
  findings: [{ body: "no flag given" }],
});
const implicitFinding = (implicit.findings as Array<Record<string, unknown>>)?.[0];
// Deliberately NOT defaulted here. Materialising `blocking: true` would pre-empt
// the API's own documented default and make the server's policy unreachable.
check(
  "an omitted blocking is not invented by the tool",
  implicitFinding !== undefined && !("blocking" in implicitFinding),
  Object.keys(implicitFinding ?? {}).join(", "),
);

// ---------------------------------------------------------------------------
// 4. Cross-repo: which hop drops what
// ---------------------------------------------------------------------------

section("cross-repo field reconciliation (regex-based)");

const readOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

const curated = readOrNull(`${META_REPO}/orchestrator/internal/rpc/curated.go`);
const apiclientSrc = readOrNull(`${META_REPO}/orchestrator/internal/apiclient/client.go`);
const apiRoutes = readOrNull(`${META_REPO}/api/src/jobs/internal-routes.ts`);

check(
  "the sibling repos are mounted",
  Boolean(curated && apiclientSrc && apiRoutes),
  [
    !curated ? `${META_REPO}/orchestrator/internal/rpc/curated.go` : null,
    !apiclientSrc ? `${META_REPO}/orchestrator/internal/apiclient/client.go` : null,
    !apiRoutes ? `${META_REPO}/api/src/jobs/internal-routes.ts` : null,
  ]
    .filter(Boolean)
    .join(", ") || "all present",
);

if (curated && apiclientSrc && apiRoutes) {
  /*
   * Downstream spellings a field may legitimately appear under.
   *
   * **This table is the check's whole escape valve, and the thing to update when a
   * field is renamed.** A field forwarded under a different name is not dropped,
   * and reporting it as dropped would be a false alarm — which matters more than
   * it sounds: a check that cries wolf gets ignored, and then it is worth nothing
   * on the day it is right (the lesson behind #83).
   *
   * Each entry is a real rename in the #38/#59/#73 lineage, not a guess:
   *   - `report_test_step`'s three params reach the wire as `testName` /
   *     `testStatus` / `testDetails`, because the API's event schema is shared with
   *     other event types that also carry a `status`.
   *   - `submit_review`'s `comment` becomes `Summary` in `Translate` (its
   *     `CuratedEvent` has no comment field) and is posted as `summary`.
   *   - `submit_design` / `submit_build_result` send `prUrl`, which Go spells
   *     `PRUrl`.
   */
  const ALIASES: Record<string, string[]> = {
    name: ["testName"],
    status: ["testStatus"],
    details: ["testDetails"],
    comment: ["summary", "comment"],
    prUrl: ["prUrl"],
  };

  const candidatesFor = (field: string): string[] => [field, ...(ALIASES[field] ?? [])];

  const anyTag = (tags: Set<string>, field: string): boolean =>
    candidatesFor(field).some((candidate) => tags.has(candidate));

  // Hop 1: the Go struct that decodes Pi's tool result. A `json:"x"` tag absent
  // here means the field never leaves that struct.
  const detailsBlock =
    /type contractToolResult struct \{([\s\S]*?)\n\t\} `json:"details"`/.exec(curated)?.[1] ?? "";
  const detailsTags = new Set(
    [...detailsBlock.matchAll(/json:"([a-zA-Z]+)(?:,[a-z]+)?"/g)].map((m) => m[1]),
  );

  // Hop 2: the `Translate` case that builds the CuratedEvent. A field absent from
  // this literal is dropped here even if the struct above carries it — this is the
  // hop #38's `header`/`options` died at.
  const caseBodies = new Map<string, string>();
  for (const match of curated.matchAll(/case "([a-z_]+)":([\s\S]*?)(?=\n\tcase |\n\tdefault:|\n\t\})/g)) {
    caseBodies.set(match[1], match[2]);
  }

  // Hop 3: the outbound request body, which is an explicit field list and so
  // drops independently of hop 2 (#38's second loss).
  const requestStruct = /type jobEventRequest struct \{([\s\S]*?)\n\}/.exec(apiclientSrc)?.[1] ?? "";
  const requestTags = new Set(
    [...requestStruct.matchAll(/json:"([a-zA-Z]+)/g)].map((m) => m[1]),
  );

  // Hop 4: what the API's event schema accepts. Scoped to the schema object and
  // matched on **indentation** rather than on `: z.`, because a field declaration
  // legitimately wraps its builder onto the next line (`options: z` then
  // `.array(`) — reading only `: z.` silently skipped exactly those, which is how
  // this check first reported `findings` as missing from the API as well.
  const schemaBlock =
    /const jobEventSchema = z\.object\(\{([\s\S]*?)\n\}\)\.superRefine/.exec(apiRoutes)?.[1] ?? "";
  const apiKeys = new Set(
    [...schemaBlock.matchAll(/^ {2}([a-zA-Z]+):/gm)].map((m) => m[1]),
  );

  check(
    "the API event schema was located",
    apiKeys.size > 10,
    `${apiKeys.size} top-level keys`,
  );

  const EMITTED_BY_TOOL: Record<string, string[]> = {
    submit_review: ["verdict", "comment", "findings"],
    ask_user: ["question", "header", "multiSelect", "options"],
    submit_adr: ["markdown", "actionItems"],
    report_test_step: ["name", "status", "details", "screenshotPath"],
    submit_test_report: [
      "passed",
      "failed",
      "skipped",
      "total",
      "coveragePercent",
      "failingTests",
      "summary",
      "recordingPath",
    ],
    update_design_preview: ["snapshot"],
    submit_design: ["snapshot", "prUrl", "summary"],
    submit_build_result: ["status", "prUrl", "summary"],
    request_action_item: ["actionItems"],
  };

  const drops: string[] = [];

  for (const [tool, fields] of Object.entries(EMITTED_BY_TOOL)) {
    const caseBody = caseBodies.get(tool) ?? "";
    for (const field of fields) {
      const inDetails = anyTag(detailsTags, field);
      // The case body names the *Go* field, so compare case-insensitively: Go
      // spells initialisms in caps (`PRUrl`), and a naive capitalise-first-letter
      // lookup reported `prUrl` as dropped on two tools that forward it.
      const inCase = candidatesFor(field).some((candidate) =>
        caseBody.toLowerCase().includes(`details.${candidate}`.toLowerCase()),
      );
      const inRequest = anyTag(requestTags, field);
      const inApi = candidatesFor(field).some((candidate) => apiKeys.has(candidate));

      if (!inDetails || !inCase || !inRequest || !inApi) {
        const stopped = [
          !inDetails ? "Details struct" : null,
          !inCase ? "Translate case" : null,
          !inRequest ? "jobEventRequest" : null,
          !inApi ? "API schema" : null,
        ]
          .filter(Boolean)
          .join(" / ");
        drops.push(`${tool}.${field} is not forwarded at: ${stopped}`);
      }
    }
  }

  /*
   * Drops that are already recorded against an issue, so this check does not sit
   * permanently red for a defect it cannot fix from this repo.
   *
   * **Keyed by `tool.field`, valued by where the fix is tracked.** Two rules make
   * the table honest rather than a way to silence the check:
   *
   *   - a drop **not** listed here fails the run, which is the point of the check;
   *   - a listed drop that is **no longer** a drop also fails, so this cannot
   *     outlive the fix. When #88 lands, this entry must be deleted or the harness
   *     reports it as stale.
   *
   * That second rule is the one that matters: a known-gap ledger without it rots
   * into a list of things nobody dares remove, and the check loses the ability to
   * notice when it should go green.
   */
  const KNOWN_DROPS: Record<string, string> = {
    "submit_review.findings":
      "yggdrasil-hq/yggdrasil-core#88 — the Orchestrator carries no `findings` " +
      "through rpc.Translate or jobEventRequest; the tool and skill halves are done",
  };

  const reportKeys = drops.map((drop) => drop.slice(0, drop.indexOf(" is not forwarded")));
  const newDrops = drops.filter((drop) => !(drop.slice(0, drop.indexOf(" is not forwarded")) in KNOWN_DROPS));
  const staleEntries = Object.keys(KNOWN_DROPS).filter((key) => !reportKeys.includes(key));

  if (newDrops.length === 0 && staleEntries.length === 0) {
    check("every emitted field is forwarded at all four hops", true);
  }

  for (const key of reportKeys) {
    if (key in KNOWN_DROPS) {
      // Reported, not passed silently: a reader should see that a field is inert
      // today even when it is someone else's to fix.
      console.log(`KNOWN  ${key} — ${KNOWN_DROPS[key]}`);
    }
  }

  if (newDrops.length > 0) {
    console.log("\nFIELDS NO DOWNSTREAM HOP FORWARDS (the #38/#59/#73 failure):");
    for (const drop of newDrops) console.log(`  - ${drop}`);
    console.log(
      "\n  A field listed above is inert at runtime: the tool emits it, the API\n" +
        "  never receives it, and the feature looks unbuilt rather than broken.\n" +
        "  The tool-side checks above cannot see this, because from inside this\n" +
        "  repo nothing is wrong.",
    );
    failures += 1;
  }

  if (staleEntries.length > 0) {
    console.log("\nSTALE KNOWN-DROP ENTRIES (the fix landed — delete these):");
    for (const key of staleEntries) console.log(`  - ${key} (${KNOWN_DROPS[key]})`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------

console.log(`\nchecks: ${checks}, failed: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
