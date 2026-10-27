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
  sortDuplicateFolders,
  sortDuplicateGroups,
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
      {
        path: "C:\\backup",
        groupCount: 1,
        fileCount: 1,
        scannedFileCount: null,
        duplicatePercentage: null,
      },
      {
        path: "C:\\photos",
        groupCount: 1,
        fileCount: 1,
        scannedFileCount: null,
        duplicatePercentage: null,
      },
      {
        path: "D:\\old",
        groupCount: 1,
        fileCount: 1,
        scannedFileCount: null,
        duplicatePercentage: null,
      },
    ]);
  });

  it("calculates each folder's share of scanned files in duplicate groups", () => {
    const folders = summarizeDuplicateFolders([group], {
      "C:\\backup": 4,
      "C:\\photos": 2,
      "D:\\old": 0,
    });
    expect(folders.map((folder) => folder.duplicatePercentage)).toEqual([
      25,
      50,
      null,
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

  it("sorts folders by file count or group count in either direction", () => {
    const folders = [
      {
        path: "C:\\middle",
        groupCount: 2,
        fileCount: 5,
        scannedFileCount: 10,
        duplicatePercentage: 50,
      },
      {
        path: "C:\\largest",
        groupCount: 3,
        fileCount: 9,
        scannedFileCount: 12,
        duplicatePercentage: 75,
      },
      {
        path: "C:\\smallest",
        groupCount: 1,
        fileCount: 2,
        scannedFileCount: 4,
        duplicatePercentage: 50,
      },
    ];
    expect(
      sortDuplicateFolders(folders, "files", "descending").map(
        (folder) => folder.path,
      ),
    ).toEqual(["C:\\largest", "C:\\middle", "C:\\smallest"]);
    expect(
      sortDuplicateFolders(folders, "groups", "ascending").map(
        (folder) => folder.path,
      ),
    ).toEqual(["C:\\smallest", "C:\\middle", "C:\\largest"]);
  });

  it("sorts by duplicate percentage and keeps unknown percentages last", () => {
    const folders = [
      {
        path: "C:\\unknown",
        groupCount: 1,
        fileCount: 1,
        scannedFileCount: null,
        duplicatePercentage: null,
      },
      {
        path: "C:\\half",
        groupCount: 1,
        fileCount: 2,
        scannedFileCount: 4,
        duplicatePercentage: 50,
      },
      {
        path: "C:\\quarter",
        groupCount: 1,
        fileCount: 1,
        scannedFileCount: 4,
        duplicatePercentage: 25,
      },
    ];
    expect(
      sortDuplicateFolders(folders, "percentage", "descending").map(
        (folder) => folder.path,
      ),
    ).toEqual(["C:\\half", "C:\\quarter", "C:\\unknown"]);
  });
});

describe("sortDuplicateGroups", () => {
  const small: DuplicateGroup = {
    hash: "small",
    files: [file("C:\\a\\a.txt"), file("C:\\b\\a.txt")],
  };
  const large: DuplicateGroup = {
    hash: "large",
    files: [
      { ...file("C:\\a\\z.txt"), size: 50 },
      { ...file("C:\\b\\z.txt"), size: 50 },
      { ...file("C:\\c\\z.txt"), size: 50 },
    ],
  };
  it("sorts by reclaimable bytes, copy count, name, and total size", () => {
    expect(
      sortDuplicateGroups([small, large], "reclaimable", "descending", {})[0]
        .hash,
    ).toBe("large");
    expect(
      sortDuplicateGroups([small, large], "copies", "descending", {})[0].hash,
    ).toBe("large");
    expect(
      sortDuplicateGroups([small, large], "name", "ascending", {})[0].hash,
    ).toBe("small");
    expect(
      sortDuplicateGroups([small, large], "size", "descending", {})[0].hash,
    ).toBe("large");
  });

  it("uses the selected kept file when sorting reclaimable bytes", () => {
    const groups: DuplicateGroup[] = [
      {
        hash: "chosen-keep",
        files: [
          { ...file("C:\\a\\large.bin"), size: 100 },
          { ...file("C:\\b\\large.bin"), size: 1 },
        ],
      },
      {
        hash: "default-keep",
        files: [
          { ...file("C:\\a\\small.bin"), size: 2 },
          { ...file("C:\\b\\small.bin"), size: 2 },
        ],
      },
    ];
    const sorted = sortDuplicateGroups(groups, "reclaimable", "descending", {
      "chosen-keep": "C:\\b\\large.bin",
    });
    expect(sorted[0].hash).toBe("chosen-keep");
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
