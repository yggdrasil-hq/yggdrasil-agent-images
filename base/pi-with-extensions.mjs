/**
 * ADR 025: materialize an organization's uploaded Pi extensions before Pi
 * starts, then exec Pi with the baked-in contract extension first and the
 * uploaded ones after it.
 *
 * Only reached when the project opted in AND the Orchestrator delivered a
 * bundle (see base/entrypoint.sh's final block) — with no bundle the entrypoint
 * still `exec`s Pi directly, so the default path is byte-identical to before
 * this feature existed.
 *
 * Why a wrapper rather than more shell: Pi is given a file path per extension,
 * the list length is dynamic, and POSIX sh has no arrays — building the argv
 * in shell would mean either losing the container's own arguments or splitting
 * paths on whitespace. Doing it here keeps the argument list exact and lets the
 * install step (which writes files) live next to the validation that guards it.
 *
 * What this deliberately does NOT do is make uploaded code safe. It runs
 * in-process with the agent, so it can read the pod environment (the project's
 * GitHub installation token and the model API key among it) and emit tool
 * calls. The controls are organizational — an admin uploads it, a project opts
 * in, the warning is acknowledged, and the upload is audited — plus the two
 * mechanical ones here: files land outside the workspace, and the bundle is
 * validated again before anything is written. ADR 025 states this plainly.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const BUNDLE_ENV_KEY = "PI_EXTENSIONS_BUNDLE";
const CONTRACT_EXTENSION =
  "/root/.pi/agent/extensions/yggdrasil-contract/src/index.ts";
const INSTALL_ROOT = "/opt/yggdrasil/extensions";

/** Mirrors api/src/extensions/bundle.ts's caps; a mismatch only ever rejects. */
const MAX_EXTENSIONS = 5;
const MAX_FILES = 16;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 96 * 1024;
const ALLOWED_EXTENSIONS = [".ts", ".js", ".json"];

const log = (message) => console.error(`pi-extensions: ${message}`);

/**
 * Fail loudly. The project opted in to running this code, so starting the
 * agent without it would produce a run whose behaviour silently differs from
 * what was configured — and the agent would then do its work under the wrong
 * assumptions. This matches ADR 021's rule that a job must not start on a
 * workspace it could not verify.
 */
function fail(message) {
  log(message);
  process.exit(1);
}

/**
 * Re-validate a path from the bundle, in the process that actually writes to
 * disk. The API validated it too; that is not redundant, because this is the
 * code that calls writeFileSync, and the two must not be able to disagree
 * about what a safe path is.
 */
function safePath(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw !== raw.trim()) return null;
  if (raw.startsWith("/")) return null;
  if (/^[A-Za-z]:/.test(raw)) return null;
  if (raw.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  const segments = raw.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  const lower = raw.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension))) return null;
  return raw;
}

/** Directory name for one extension: index-prefixed so ordering is stable. */
function installDirName(index, slug) {
  const safeSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  return `${index}-${safeSlug || "extension"}`;
}

/**
 * Lock the tree down: files first (directories must still be traversable in
 * their writable form), then directories deepest-first. 0444/0555 is a guard
 * against the agent's own tooling editing what it was handed, not a security
 * boundary -- the agent runs as root here, and ADR 025 says so rather than
 * implying otherwise. The boundary that does hold is that none of this lives
 * inside /workspace, so it can never be committed to the project's repository.
 */
function lockDown(files, dirs) {
  for (const file of files) chmodSync(file, 0o444);
  for (const path of [...dirs].sort((a, b) => b.length - a.length)) chmodSync(path, 0o555);
}

/**
 * Open a previously locked tree back up so it can be removed. Without this,
 * the cleanup below cannot descend: deleting an entry needs write permission
 * on its parent directory, and a 0555 parent refuses -- which the removal at
 * the top of install() would hit on any second run in the same container.
 * Each pod is one run so this should never fire in practice, but a cleanup
 * that only works on a pristine filesystem is not a cleanup.
 */
function makeRemovable(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true, recursive: true });
  } catch {
    return;
  }
  // Deepest-first so a directory is opened before its parent is removed.
  for (const entry of [...entries].reverse()) {
    const full = `${entry.parentPath ?? entry.path}/${entry.name}`;
    try {
      chmodSync(full, entry.isDirectory() ? 0o700 : 0o600);
    } catch {
      // Best-effort: the removal below still reports a real failure.
    }
  }
}

function install() {
  const raw = process.env[BUNDLE_ENV_KEY];
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${BUNDLE_ENV_KEY} is not valid JSON`);
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.extensions)) {
    fail(`${BUNDLE_ENV_KEY} has no extensions array`);
    return [];
  }
  if (parsed.extensions.length > MAX_EXTENSIONS) {
    fail(`bundle carries ${parsed.extensions.length} extensions, over the limit of ${MAX_EXTENSIONS}`);
  }

  // Fresh directory each run: a job pod is one run, and anything left behind
  // by a previous write must not be able to sit alongside this one.
  if (existsSync(INSTALL_ROOT)) {
    makeRemovable(INSTALL_ROOT);
    rmSync(INSTALL_ROOT, { recursive: true, force: true });
  }

  const entryPaths = [];

  parsed.extensions.forEach((extension, index) => {
    const entry = safePath(extension?.entryPath);
    if (!entry) fail(`extension ${index} has an unusable entry path`);
    if (!Array.isArray(extension?.files) || extension.files.length === 0) {
      fail(`extension ${index} has no files`);
    }
    if (extension.files.length > MAX_FILES) {
      fail(`extension ${index} has ${extension.files.length} files, over the limit of ${MAX_FILES}`);
    }

    const dir = `${INSTALL_ROOT}/${installDirName(index, extension.slug)}`;
    // The tree is created writable and locked down once it is complete
    // (below). Creating directories at their final 0555 mode would make them
    // unwritable immediately, so the first file inside could not be written --
    // caught by running this installer against a stub, not by reading it.
    mkdirSync(dir, { recursive: true });

    let total = 0;
    const seen = new Set();
    const dirs = new Set([dir]);
    const written = [];
    for (const file of extension.files) {
      const path = safePath(file?.path);
      if (!path) fail(`extension ${index} has an unusable file path`);
      if (seen.has(path)) fail(`extension ${index} repeats the path ${path}`);
      seen.add(path);
      if (typeof file.content !== "string") fail(`extension ${index}: ${path} has non-string content`);
      if (file.content.includes("\u0000")) fail(`extension ${index}: ${path} contains a NUL byte`);

      const size = Buffer.byteLength(file.content, "utf8");
      if (size > MAX_FILE_BYTES) fail(`extension ${index}: ${path} exceeds ${MAX_FILE_BYTES} bytes`);
      total += size;

      const target = `${dir}/${path}`;
      // The join cannot escape `dir` because safePath rejected absolute paths,
      // backslashes and any "."/".." segment, but assert it anyway: this is
      // the last statement before a write.
      if (!target.startsWith(`${dir}/`)) fail(`extension ${index}: ${path} escapes its directory`);

      const parent = target.slice(0, target.lastIndexOf("/"));
      mkdirSync(parent, { recursive: true });
      for (let cursor = parent; cursor.startsWith(`${dir}/`); cursor = cursor.slice(0, cursor.lastIndexOf("/"))) {
        dirs.add(cursor);
      }

      writeFileSync(target, file.content);
      written.push(target);
    }
    if (total > MAX_TOTAL_BYTES) {
      fail(`extension ${index} is ${total} bytes, over the limit of ${MAX_TOTAL_BYTES}`);
    }

    // Now lock it down (see lockDown's comment for what this is and is not).
    lockDown(written, dirs);

    const entryFullPath = `${dir}/${entry}`;
    // Record which revision of which extension this run loaded. An uploaded
    // extension is code, so "what exactly ran" must be answerable from the
    // pod's own log; the API computes the same digest over the same files.
    const digest = createHash("sha256");
    for (const path of [...seen].sort()) {
      digest.update(`${Buffer.byteLength(path, "utf8")}:${path}`);
      const content = extension.files.find((file) => file.path === path).content;
      digest.update(`${Buffer.byteLength(content, "utf8")}:`);
      digest.update(content);
    }
    const actual = digest.digest("hex");
    if (typeof extension.sha256 === "string" && extension.sha256 !== actual) {
      fail(
        `extension ${index} (${extension.slug}) hashes to ${actual}, not the delivered ${extension.sha256}`,
      );
    }
    log(`loaded ${extension.slug} revision ${actual} from ${entryFullPath}`);

    entryPaths.push(entryFullPath);
  });

  return entryPaths;
}

const uploaded = install();

// The contract extension is always first and always present -- it is what
// makes the Orchestrator's turn/completion protocol work (ADR 004). An
// uploaded extension is loaded after it, so the contract is registered before
// any uploaded code runs.
const args = [
  "--mode",
  "rpc",
  "--extension",
  CONTRACT_EXTENSION,
  ...uploaded.flatMap((path) => ["--extension", path]),
  ...process.argv.slice(2),
];

const child = spawn("pi", args, { stdio: "inherit" });

// Pi is the only thing that talks the JSONL RPC protocol on this container's
// stdio, so this wrapper must be transparent in both directions: inherit the
// fds (above), forward the signals a pod sends, and exit with Pi's own status
// so the container's exit code still means what it meant before this wrapper
// existed.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  log(`failed to start pi: ${error.message}`);
  process.exit(1);
});
