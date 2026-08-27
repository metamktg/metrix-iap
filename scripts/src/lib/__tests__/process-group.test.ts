// The only claim worth testing here is the one the bug was about: a kill
// must reach the GRANDCHILD.
//
// The real shape is `pnpm run dev` → sh → node vite.js, and the old
// `child.kill()` reached only pnpm, leaving vite alive on its port. These
// tests reproduce that shape with `sh -c "sleep …"`, which is the same
// two-level tree, and assert the grandchild is actually gone afterwards —
// not merely that the call returned.

import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnGroup, killGroup } from "../process-group.js";

/**
 * Is this pid still RUNNING?
 *
 * Not `process.kill(pid, 0)`. That succeeds on a zombie, and a zombie is
 * exactly what a correctly-killed grandchild becomes here: its parent died
 * with it, so it reparents to pid 1, and pid 1 in this container does not
 * reap. Probing with signal 0 therefore reports a process that is provably
 * dead as alive — which is how the first draft of this test "failed" against
 * a fix that works. Read the state field instead: Z is dead.
 */
function alive(pid: number): boolean {
  const st = procStat(pid);
  return st !== null && st.state !== "Z";
}

function procStat(pid: number): { state: string; ppid: number } | null {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
    // The comm field can contain spaces and parens, so read fields positionally
    // from the LAST ')' rather than by splitting the whole line.
    const after = raw.slice(raw.lastIndexOf(")") + 2).split(" ");
    return { state: after[0]!, ppid: Number(after[1]) };
  } catch {
    return null; // process is gone entirely
  }
}

/**
 * The pid of the `sleep` a shell launched — i.e. the grandchild that the old
 * code leaked. Read from /proc rather than parsed out of `ps`, so it cannot
 * pick up an unrelated sleep from a concurrent test.
 */
function childPidsOf(pid: number): number[] {
  const out: number[] = [];
  let entries: string[];
  try {
    entries = readdirSync("/proc");
  } catch {
    return out; // not Linux — the caller's expect() will say so
  }
  for (const e of entries) {
    if (!/^\d+$/.test(e)) continue;
    if (procStat(Number(e))?.ppid === pid) out.push(Number(e));
  }
  return out;
}

async function settle(ms = 200): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

const started: ChildProcess[] = [];
afterEach(() => {
  for (const c of started) killGroup(c, "SIGKILL");
  started.length = 0;
});

// Establishing that a specific pid is dead rather than merely unsignalled
// needs the state field, and that means /proc. CI and the dev container are
// Linux; on anything else these skip rather than fail, because a red test on
// a Mac would say "the fix is broken" when it means "there is no /proc".
const LINUX = existsSync("/proc/self/stat");

describe.skipIf(!LINUX)("killGroup", () => {
  it("kills the grandchild, which is the whole point", async () => {
    const parent = spawnGroup("sh", ["-c", "sleep 60"], { stdio: "ignore" });
    started.push(parent);
    await settle();

    const grandchildren = childPidsOf(parent.pid!);
    expect(grandchildren.length).toBeGreaterThan(0);
    const sleeper = grandchildren[0]!;
    expect(alive(sleeper)).toBe(true);

    killGroup(parent);
    await settle(400);

    expect(alive(sleeper)).toBe(false);
  });

  it("is what a plain .kill() is not — the grandchild survives that one", async () => {
    // Guards against the fix being quietly reverted to `child.kill()`: if this
    // ever starts passing with the grandchild dead, the premise changed and
    // the test above stopped proving anything.
    const parent = spawn("sh", ["-c", "sleep 60"], { stdio: "ignore" });
    started.push(parent);
    await settle();

    const sleeper = childPidsOf(parent.pid!)[0]!;
    expect(alive(sleeper)).toBe(true);

    parent.kill();
    await settle(400);

    expect(alive(sleeper)).toBe(true); // still there — this is the bug
    process.kill(sleeper, "SIGKILL");
  });

  it("never throws on a group that is already gone", async () => {
    const parent = spawnGroup("sh", ["-c", "exit 0"], { stdio: "ignore" });
    await new Promise((r) => parent.once("exit", r));
    await settle();
    expect(() => killGroup(parent)).not.toThrow();
    expect(() => killGroup(undefined)).not.toThrow();
    expect(() => killGroup(null)).not.toThrow();
  });

  it("keeps spawn's stdio typing, so callers still get real streams", async () => {
    const child = spawnGroup("sh", ["-c", "echo hello"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    started.push(child);
    // If the overload were widened to plain ChildProcess this would not
    // compile — .stdout would be possibly-null. That is a compile-time claim;
    // reading it here proves the pipe is real at runtime too.
    const text = await new Promise<string>((resolve) => {
      let buf = "";
      child.stdout.on("data", (d: Buffer) => (buf += d.toString()));
      child.once("exit", () => resolve(buf));
    });
    expect(text.trim()).toBe("hello");
  });
});
