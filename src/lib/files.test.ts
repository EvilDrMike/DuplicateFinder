import { describe, expect, it } from "vitest";
import type { DuplicateGroup } from "../types";
import {
  applyFolderOrder,
  fileExtension,
  folderFromPath,
  isImageFile,
  isPathInsideFolder,
  planFolderCleanup,
  selectedFolderPositions,
  summarizeDuplicateFolders,
  toFileInput,
} from "./files";

const file = (path: string, contentHash?: string) => ({
  path,
  name: path.split(/[\\/]/).pop()!,
  size: 10,
  contentHash,
});

const group: DuplicateGroup = {
  hash: "a-1",
  files: [
    file("C:\\photos\\a.jpg"),
    file("C:\\backup\\a.jpg"),
    file("D:\\old\\a.jpg"),
  ],
};

describe("path helpers", () => {
  it("detects image files case-insensitively", () => {
    expect(isImageFile({ name: "Photo.JPG" })).toBe(true);
    expect(isImageFile({ name: "notes.txt" })).toBe(false);
  });

  it("returns the file extension", () => {
    expect(fileExtension("report.final.pdf")).toBe("pdf");
  });

  it("extracts the folder from Windows and POSIX paths", () => {
    expect(folderFromPath("C:\\photos\\a.jpg")).toBe("C:\\photos");
    expect(folderFromPath("/home/me/a.jpg")).toBe("/home/me");
    expect(folderFromPath("a.jpg")).toBe("a.jpg");
  });

  it("checks folder containment without matching sibling prefixes", () => {
    expect(isPathInsideFolder("C:\\Photos\\Out", "c:/photos")).toBe(true);
    expect(isPathInsideFolder("C:\\photos", "C:\\photos\\")).toBe(true);
    expect(isPathInsideFolder("C:\\photos-backup", "C:\\photos")).toBe(false);
  });

  it("falls back to the group hash when a file has no content hash", () => {
    expect(toFileInput(group.files[0], group).expectedHash).toBe("a-1");
    const named = file("C:\\x\\a.jpg", "own-hash");
    expect(toFileInput(named, group).expectedHash).toBe("own-hash");
  });
});

describe("folder summaries", () => {
  it("counts groups and files per folder, sorted by path", () => {
    expect(summarizeDuplicateFolders([group])).toEqual([
      { path: "C:\\backup", groupCount: 1, fileCount: 1 },
      { path: "C:\\photos", groupCount: 1, fileCount: 1 },
      { path: "D:\\old", groupCount: 1, fileCount: 1 },
    ]);
  });

  it("applies a custom order and appends unordered folders", () => {
    const folders = summarizeDuplicateFolders([group]);
    const ordered = applyFolderOrder(folders, ["D:\\old", "missing"]);
    expect(ordered.map((folder) => folder.path)).toEqual([
      "D:\\old",
      "C:\\backup",
      "C:\\photos",
    ]);
  });
});

describe("planFolderCleanup", () => {
  const folders = summarizeDuplicateFolders([group]);

  it("returns null when no copy is in a selected folder", () => {
    expect(planFolderCleanup(group, new Map())).toBeNull();
  });

  it("keeps a copy outside the selection and removes the selected ones", () => {
    const positions = selectedFolderPositions(folders, [
      "C:\\backup",
      "D:\\old",
    ]);
    const plan = planFolderCleanup(group, positions)!;
    expect(plan.keptFile.path).toBe("C:\\photos\\a.jpg");
    expect(plan.removable.map((item) => item.path)).toEqual([
      "C:\\backup\\a.jpg",
      "D:\\old\\a.jpg",
    ]);
  });

  it("keeps the copy in the highest-priority folder when all are selected", () => {
    const ordered = applyFolderOrder(folders, ["D:\\old"]);
    const positions = selectedFolderPositions(
      ordered,
      ordered.map((folder) => folder.path),
    );
    const plan = planFolderCleanup(group, positions)!;
    expect(plan.keptFile.path).toBe("D:\\old\\a.jpg");
    expect(plan.removable.map((item) => item.path)).toEqual([
      "C:\\backup\\a.jpg",
      "C:\\photos\\a.jpg",
    ]);
  });
});
