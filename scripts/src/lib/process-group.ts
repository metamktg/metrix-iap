// Kill the server, not just the thing that launched it.
//
// Every smoke script starts its dev/preview server with
// `spawn("pnpm", ["--filter", …, "run", "dev"])`, which is three processes
// deep: pnpm → sh -c → node vite.js. `child.kill()` signals only pnpm, so
// whether the vite behind it also dies is left to chance — measured here, a
// plain kill on a real `pnpm run dev` left TWO descendants running, the vite
// server among them, reparented to init and still holding its port. It
// sometimes gets away with it (a vite that next writes to the now-closed
// stdout pipe dies of EPIPE), which is worse than always failing: the leak is
// intermittent, so nobody attributes anything to it.
//
// The consequence is not a tidiness problem, it is a correctness problem for
// the suite itself. The next run finds the port taken, its own dev server
// fails to start, and its specs then talk to the STALE server left behind by
// an earlier run — so they report layout failures that describe code nobody
// is running. That is exactly how it presented: a login-page spec failing
// eight of ten assertions on a page the branch had never touched, with twelve
// orphaned vite servers sitting behind it, accumulated from runs that had been
// interrupted. A false bug report is worse than a missing one, because it
// costs a diagnosis before it costs a fix.
//
// The fix is to put the server in its own process GROUP (`detached: true`)
// and signal the group (`process.kill(-pid)`), which reaches every descendant.
// The group is also killed if this process exits by any route it can observe,
// so an interrupted run leaves nothing behind either.

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/** Groups we started and have not yet reaped, so exit hooks can clean up. */
const live = new Set<ChildProcess>();
let hooksInstalled = false;

function installExitHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const sweep = () => {
    for (const child of live) killGroup(child);
    live.clear();
  };
  process.on("exit", sweep);
  // SIGKILL cannot be trapped — nothing can help there — but every signal that
  // can be is worth handling, because an interrupted run is the common case.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      sweep();
      process.exit(130);
    });
  }
  // No 'uncaughtException' handler on purpose. Node runs 'exit' listeners on
  // the fatal-exception path too (verified: hook fires, stack still prints,
  // exit code still 1), so one would be redundant — and registering one
  // changes the default reporting these scripts rely on to fail loudly.
}

/**
 * Spawn a child as the leader of its own process group.
 *
 * Identical to `spawn` otherwise. Use it for any `pnpm run X`: pnpm always
 * puts a shell between itself and the real process, so a plain `.kill()` on
 * the handle can never reach the thing actually doing the work — true for the
 * dev servers and equally true for a `runStep` that fans out to tsc, esbuild
 * and vite.
 *
 * Not needed for a child that reliably exits on its own and is awaited, and
 * whose own descendants clean themselves up — the spec runners, where
 * Playwright closes the browser it opened. Those stay plain `spawn`.
 */
// Typed as `typeof spawn` rather than a hand-written signature so it inherits
// every overload — in particular the stdio-tuple one, which is what tells a
// caller passing `["ignore", "pipe", "pipe"]` that `.stdout` and `.stderr` are
// non-null. A narrower signature here would push a null check onto all fifteen
// call sites for no reason.
export const spawnGroup: typeof spawn = ((
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): ChildProcess => {
  installExitHooks();
  // detached: true only creates the group. We deliberately do not call
  // .unref() — the caller still waits on this child as before.
  const child = spawn(command, args, { ...options, detached: true });
  live.add(child);
  child.once("exit", () => live.delete(child));
  return child;
}) as typeof spawn;

/**
 * Signal the whole process group, so the real server dies with its launcher.
 *
 * Never throws. A group that is already gone is the normal case at cleanup
 * time, and a cleanup step that throws would turn a passing run red.
 */
export function killGroup(child: ChildProcess | undefined | null, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!child?.pid) return;
  try {
    // Negative pid = "the group led by pid". This is the whole point.
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH (already dead) or EPERM (not a group leader — e.g. spawned
    // without detached). Fall back to the direct child so behaviour is never
    // worse than the plain .kill() this replaces.
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}
