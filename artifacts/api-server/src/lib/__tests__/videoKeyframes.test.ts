// ─── Video keyframe extraction — ffmpeg integration test ──────────────
// Synthesizes a tiny mp4 with the system ffmpeg, then verifies the
// extractor returns decodable JPEG frames and rejects non-video bytes.

import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { extractVideoKeyframes } from "../videoKeyframes";

const execFileAsync = promisify(execFile);

let videoBytes: Buffer;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "kf-test-"));
  const out = join(dir, "clip.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "color=c=red:s=64x64:d=2",
    "-pix_fmt", "yuv420p",
    out,
  ]);
  videoBytes = await readFile(out);
}, 30_000);

describe("extractVideoKeyframes", () => {
  it("extracts JPEG frames from a real video", async () => {
    const frames = await extractVideoKeyframes(videoBytes, "clip.mp4");
    expect(frames.length).toBeGreaterThanOrEqual(1);
    for (const f of frames) {
      // JPEG magic bytes.
      expect(f.jpeg[0]).toBe(0xff);
      expect(f.jpeg[1]).toBe(0xd8);
    }
    expect(frames[0]!.label).toContain("opening");
  }, 30_000);

  it("throws for bytes that are not a decodable video", async () => {
    await expect(extractVideoKeyframes(Buffer.from("not a video at all"), "junk.mp4")).rejects.toThrow(
      /Could not extract any frames/,
    );
  }, 30_000);
});
