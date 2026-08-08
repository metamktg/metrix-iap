// ─── Video keyframe extraction ────────────────────────────────────────
// Extracts representative still frames from an uploaded video creative so
// the existing image classification pipeline can grade it. Uses the
// system ffmpeg/ffprobe binaries (present in the Replit runtime path).
//
// Frames are sampled at deterministic timestamps (opening beat, middle,
// closing beat) so re-runs of the same video classify the same visuals.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VideoKeyframe = {
  /** Human-readable position label, used in the model prompt. */
  label: string;
  /** Timestamp in seconds the frame was sampled at. */
  timestamp: number;
  /** JPEG bytes. */
  jpeg: Buffer;
};

/**
 * Deterministic sample timestamps for a video of the given duration:
 * an opening frame (past any fade-in), the midpoint, and a closing frame
 * (usually the CTA end-card). Short clips collapse to fewer distinct
 * points; duration-unknown falls back to the opening frame only.
 */
export function keyframeTimestamps(durationSeconds: number | null): Array<{ label: string; timestamp: number }> {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [{ label: "opening frame", timestamp: 0 }];
  }
  const open = Math.min(0.5, durationSeconds / 10);
  const mid = durationSeconds / 2;
  const close = Math.max(0, durationSeconds - Math.min(1, durationSeconds / 10));
  const points = [
    { label: "opening frame", timestamp: open },
    { label: "middle frame", timestamp: mid },
    { label: "closing frame (end card)", timestamp: close },
  ];
  // Collapse near-duplicate timestamps (very short clips).
  const out: Array<{ label: string; timestamp: number }> = [];
  for (const p of points) {
    const t = Math.round(p.timestamp * 100) / 100;
    if (out.some((o) => Math.abs(o.timestamp - t) < 0.25)) continue;
    out.push({ label: p.label, timestamp: t });
  }
  return out;
}

async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ]);
    const dur = Number(stdout.trim());
    return Number.isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  }
}

/**
 * Extract keyframes from raw video bytes. Throws when ffmpeg cannot decode
 * the file at all (corrupt / not actually a video).
 */
export async function extractVideoKeyframes(videoBytes: Buffer, filename: string): Promise<VideoKeyframe[]> {
  const dir = await mkdtemp(join(tmpdir(), "metrix-keyframes-"));
  try {
    const ext = /\.([a-zA-Z0-9]+)$/.exec(filename)?.[1]?.toLowerCase() ?? "mp4";
    const src = join(dir, `source.${ext}`);
    await writeFile(src, videoBytes);

    const duration = await probeDuration(src);
    const points = keyframeTimestamps(duration);

    const frames: VideoKeyframe[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const out = join(dir, `frame-${i}.jpg`);
      try {
        await execFileAsync("ffmpeg", [
          "-y",
          "-ss", String(p.timestamp),
          "-i", src,
          "-frames:v", "1",
          "-q:v", "3",
          out,
        ], { timeout: 60_000 });
        const jpeg = await readFile(out);
        if (jpeg.length > 0) frames.push({ label: p.label, timestamp: p.timestamp, jpeg });
      } catch {
        // Individual timestamp may be past the last decodable frame — skip.
      }
    }
    if (frames.length === 0) {
      throw new Error(`Could not extract any frames from video "${filename}".`);
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
