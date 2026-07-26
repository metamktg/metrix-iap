import { readFile } from "node:fs/promises";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ImageDimensions {
  width: number;
  height: number;
}

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

/**
 * Reads width/height straight out of the PNG IHDR chunk. No image library
 * dependency — the manifest only ever accepts PNGs (CLAUDE.md filename
 * rule: <CONCEPT_ID>_4x5.png), so a full decoder would be dead weight.
 */
export function readPngDimensions(buffer: Buffer): ImageDimensions {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new InvalidImageError("File is not a valid PNG (bad signature).");
  }
  // Bytes 8-11: IHDR chunk length, 12-15: "IHDR", 16-19: width, 20-23: height (big-endian).
  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    throw new InvalidImageError("File is not a valid PNG (missing IHDR chunk).");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

export async function readPngDimensionsFromFile(filePath: string): Promise<ImageDimensions> {
  const buffer = await readFile(filePath);
  return readPngDimensions(buffer);
}

/** ECAS creatives must be exactly 4:5 (e.g. 1080x1350), matching the *_4x5.png naming convention. */
export function isFourByFive({ width, height }: ImageDimensions): boolean {
  return width > 0 && height > 0 && width * 5 === height * 4;
}
