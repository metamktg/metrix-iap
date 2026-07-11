// Cross-process mutex for validation scripts that touch the shared generated
// API libs (lib/api-zod, lib/api-client-react) or rebuild composite lib
// declarations via `tsc --build`.
//
// Why: the api-codegen-drift check regenerates lib/*/src/generated/** with
// orval `clean: true` — the files are deleted and rewritten mid-run. Any
// concurrently running validation that executes `typecheck:libs` (or a Vite/
// esbuild build that imports those sources) in that window fails with bogus
// TS6053 "file not found" errors even though nothing is broken. Serializing
// the lib-touching phases makes concurrent validation batches deterministic.
//
// Implementation: an atomic `fs.mkdirSync` lock directory in the OS temp dir,
// holding a pid file. A lock is considered stale (and is taken over) when the
// owning pid is no longer alive or the lock is older than STALE_MS — so a
// SIGKILLed validation run never wedges future runs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOCK_DIR = path.join(os.tmpdir(), "metrix-validation-libs.lock");
const PID_FILE = path.join(LOCK_DIR, "pid");

// A full codegen + typecheck + build sequence takes a few minutes; anything
// past this age is assumed dead even if the pid happens to be recycled.
const STALE_MS = 20 * 60 * 1000;
// Give a queued validation ample time to wait out every other one.
const ACQUIRE_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we can't signal it.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lockIsStale(): boolean {
  // A live owner is never stale, no matter how long it has held the lock —
  // legitimately slow runs must not have their lock yanked mid-build. The
  // owner refreshes the lock's mtime via a heartbeat, so the age check below
  // only condemns locks whose owner can no longer be identified.
  try {
    const pid = Number.parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
    if (Number.isFinite(pid) && pid > 0) return !pidAlive(pid);
  } catch {
    // Pid file not written yet (owner mid-acquire) or unreadable — fall
    // through to the age-based check.
  }
  try {
    const stat = fs.statSync(LOCK_DIR);
    return Date.now() - stat.mtimeMs > STALE_MS;
  } catch {
    // Lock vanished between checks — not stale, just gone.
    return false;
  }
}

function tryAcquire(): boolean {
  try {
    fs.mkdirSync(LOCK_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
  fs.writeFileSync(PID_FILE, String(process.pid));
  return true;
}

function release(): void {
  try {
    const pid = Number.parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
    // Only remove a lock we own — never yank it out from under a takeover.
    if (pid !== process.pid) return;
  } catch {
    // No pid file: assume ours (we may have crashed between mkdir and write).
  }
  fs.rmSync(LOCK_DIR, { recursive: true, force: true });
}

async function acquire(label: string): Promise<void> {
  const start = Date.now();
  let waitedLogged = false;
  for (;;) {
    if (tryAcquire()) return;
    if (lockIsStale()) {
      console.log(`[${label}] Removing stale validation lock and retrying...`);
      fs.rmSync(LOCK_DIR, { recursive: true, force: true });
      continue;
    }
    if (!waitedLogged) {
      console.log(
        `[${label}] Waiting for another validation to finish using the shared generated libs...`,
      );
      waitedLogged = true;
    }
    if (Date.now() - start > ACQUIRE_TIMEOUT_MS) {
      throw new Error(
        `Timed out after ${Math.round(ACQUIRE_TIMEOUT_MS / 60000)} minutes waiting for the validation lock at ${LOCK_DIR}. ` +
          "If no other validation is running, delete that directory and retry.",
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Run `fn` while holding the shared validation lock. Every validation script
 * that regenerates, rebuilds, or reads the shared generated API libs must
 * wrap that phase in this — otherwise concurrent batches race and fail with
 * spurious TS6053 errors.
 */
export async function withValidationLock<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  await acquire(label);
  const onExit = () => release();
  process.on("exit", onExit);
  // Heartbeat: refresh the lock's mtime while held so the age-based staleness
  // fallback (used when the pid file is unreadable) never condemns a live,
  // legitimately long-running owner.
  const heartbeat = setInterval(() => {
    const now = new Date();
    try {
      fs.utimesSync(LOCK_DIR, now, now);
    } catch {
      // Lock removed out from under us (stale takeover); nothing to refresh.
    }
  }, 60_000);
  heartbeat.unref();
  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    process.removeListener("exit", onExit);
    release();
  }
}
