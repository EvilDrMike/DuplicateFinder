import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, pluralize } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [10 * 1024, "10 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
    [3 * 1024 ** 3, "3.0 GB"],
    [2048 * 1024 ** 3, "2048 GB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "--"],
    [-5, "--"],
    [250.4, "250 ms"],
    [1500, "1.50 s"],
    [125_000, "2m 5.0s"],
  ])("formats %d ms as %s", (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });
});

describe("pluralize", () => {
  it("uses the singular form only for exactly one", () => {
    expect(pluralize(1, "file")).toBe("file");
    expect(pluralize(0, "file")).toBe("files");
    expect(pluralize(2, "copy", "copies")).toBe("copies");
  });
});
