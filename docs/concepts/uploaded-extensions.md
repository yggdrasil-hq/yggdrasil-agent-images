# Concept: uploaded extensions

**Read this when:** you're changing how an uploaded extension is installed, or
you need to understand what an upload is allowed to do.
**Skip if:** you only care about the baked-in `yggdrasil-contract` extension —
see `contract-extension.md`.

## What an upload is

A **bundle of source files** (`.ts`/`.js`/`.json`), not an archive and not a
package. Stored by the API per organization, one row per file, and delivered to
a job pod as a single env var, `PI_EXTENSIONS_BUNDLE`, holding:

```json
{"version":1,"extensions":[{"slug":"…","entryPath":"src/index.ts",
  "sha256":"…","files":[{"path":"src/index.ts","content":"…"}]}]}
```

An extension cannot declare dependencies: nothing installs them in a pod, so a
bundle with a non-empty `dependencies` (or `devDependencies` / `peerDependencies`
/ `optionalDependencies`) is refused at upload. The baked-in contract extension
pins `typebox` to match Pi exactly for precisely this reason — a mismatched copy
at runtime is a real failure mode — and an upload cannot re-create it.

## How it is installed

`base/entrypoint.sh` ends with, when `PI_EXTENSIONS_BUNDLE` is set:

```sh
exec node /usr/local/bin/pi-with-extensions.mjs "$@"
```

Otherwise it `exec`s Pi directly, exactly as it did before this existed — a
project that has not opted in takes an unchanged path.

`base/pi-with-extensions.mjs` then:

1. re-validates every path in the bundle (the API validated it too; this is the
   process that actually calls `writeFileSync`, so the two must not be able to
   disagree about what a safe path is),
2. writes the files under `/opt/yggdrasil/extensions/<index>-<slug>/`, **outside
   `/workspace`** so nothing here can be committed to the project's repository,
3. locks files to `0444` and directories to `0555`,
4. verifies the delivered `sha256` against a digest recomputed from the files,
   and logs `loaded <slug> revision <digest>`, and
5. execs Pi with the contract extension **first**, then the uploaded ones, then
   the container's own arguments.

A malformed bundle, a path that fails validation, or a digest mismatch **exits
non-zero** rather than starting Pi without the extension: the project opted in
to running this code, so a run whose behaviour silently differs from its
configuration is worse than a failed one.

## What this does NOT do

It does **not** sandbox anything, and the file modes are not a security
boundary: the agent runs as root in this container, so `0444`/`0555` only stop
accidental edits and the agent's own tooling. An uploaded extension is imported
**into the Pi process**, so it can read the pod environment — the project's
GitHub installation token and the model API key among it — make network calls,
and emit tool calls.

The controls are organizational rather than technical (ADR 025): an org admin
uploads it, a project opts in, the upload requires an acknowledged warning, and
every upload/replacement/deactivation/deletion is audited. The one mechanical
guard beyond the above is that a bundle naming a `yggdrasil-contract` tool
(`ask_user`, `submit_adr`, …) is refused, because those tools carry the
Orchestrator's turn/completion protocol — see `contract-extension.md`. That
check is a heuristic, not a guarantee.
