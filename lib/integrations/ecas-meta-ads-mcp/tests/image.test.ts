import { describe, expect, it } from "vitest";
import { InvalidImageError, isFourByFive, readPngDimensions } from "../src/image.js";
import { makeMinimalPng } from "./fixtures.js";

describe("readPngDimensions", () => {
  it("reads width/height out of the IHDR chunk", () => {
    expect(readPngDimensions(makeMinimalPng(1080, 1350))).toEqual({ width: 1080, height: 1350 });
  });

  it("throws InvalidImageError on a bad signature", () => {
    expect(() => readPngDimensions(Buffer.from("definitely not a png"))).toThrowError(InvalidImageError);
  });

  it("throws InvalidImageError on a truncated buffer", () => {
    expect(() => readPngDimensions(Buffer.alloc(4))).toThrowError(InvalidImageError);
  });
});

describe("isFourByFive", () => {
  it("accepts an exact 4:5 ratio", () => {
    expect(isFourByFive({ width: 1080, height: 1350 })).toBe(true);
    expect(isFourByFive({ width: 4, height: 5 })).toBe(true);
  });

  it("rejects a non-4:5 ratio", () => {
    expect(isFourByFive({ width: 1000, height: 1000 })).toBe(false);
    expect(isFourByFive({ width: 1080, height: 1080 })).toBe(false);
  });

  it("rejects zero-sized dimensions", () => {
    expect(isFourByFive({ width: 0, height: 0 })).toBe(false);
  });
});
