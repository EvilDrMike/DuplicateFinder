import type {
  DuplicateFile,
  DuplicateFolder,
  DuplicateGroup,
  FolderSortBy,
  FileInput,
  GroupSortBy,
  MoveCandidateFile,
  SortDirection,
} from "../types";

export function isImageFile(file: Pick<DuplicateFile, "name">) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
}

export function fileExtension(name: string) {
  return name.split(".").pop() ?? "";
}

export function folderFromPath(filePath: string) {
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : filePath;
}

export function isPathInsideFolder(path: string, folder: string) {
  const normalize = (value: string) =>
    value
      .replace(/[\\/]+/g, "\\")
      .replace(/\\+$/, "")
      .toLowerCase();
  const normalizedPath = normalize(path);
  const normalizedFolder = normalize(folder);
  return (
    normalizedPath === normalizedFolder ||
    normalizedPath.startsWith(`${normalizedFolder}\\`)
  );
}

export function expectedHash(file: DuplicateFile, group: DuplicateGroup) {
  return file.contentHash ?? group.hash;
}

export function toFileInput(
  file: DuplicateFile,
  group: DuplicateGroup,
): FileInput {
  return { path: file.path, expectedHash: expectedHash(file, group) };
}

export function toMoveCandidate(
  file: DuplicateFile,
  group: DuplicateGroup,
): MoveCandidateFile {
  return { ...file, expectedHash: expectedHash(file, group) };
}

function groupSortValue(
  group: DuplicateGroup,
  sortBy: GroupSortBy,
  keptFiles: Record<string, string>,
): number | string {
  switch (sortBy) {
    case "reclaimable": {
      const keptPath = keptFiles[group.hash] ?? group.files[0]?.path;
      return group.files
        .filter((file) => file.path !== keptPath)
        .reduce((total, file) => total + file.size, 0);
    }
    case "copies":
      return group.files.length;
    case "name":
      return group.files[0]?.name ?? "";
    case "size":
      return group.files.reduce((total, file) => total + file.size, 0);
  }
}

export function sortDuplicateGroups(
  groups: DuplicateGroup[],
  sortBy: GroupSortBy,
  direction: SortDirection,
  keptFiles: Record<string, string>,
) {
  const directionMultiplier = direction === "ascending" ? 1 : -1;
  return [...groups].sort((left, right) => {
    const leftValue = groupSortValue(left, sortBy, keptFiles);
    const rightValue = groupSortValue(right, sortBy, keptFiles);
    const comparison =
      typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue, undefined, {
            sensitivity: "base",
          })
        : Number(leftValue) - Number(rightValue);
    if (comparison !== 0) return comparison * directionMultiplier;
    return (
      (left.files[0]?.name ?? "").localeCompare(
        right.files[0]?.name ?? "",
        undefined,
        { sensitivity: "base" },
      ) || left.hash.localeCompare(right.hash)
    );
  });
}

export function summarizeDuplicateFolders(
  groups: DuplicateGroup[],
  folderFileCounts: Record<string, number> = {},
): DuplicateFolder[] {
  const folderMap = new Map<string, { groups: Set<string>; files: number }>();
  groups.forEach((group) => {
    group.files.forEach((file) => {
      const folder = folderFromPath(file.path);
      const summary = folderMap.get(folder) ?? {
        groups: new Set<string>(),
        files: 0,
      };
      summary.groups.add(group.hash);
      summary.files += 1;
      folderMap.set(folder, summary);
    });
  });
  return [...folderMap.entries()]
    .map(([path, summary]) => ({
      path,
      groupCount: summary.groups.size,
      fileCount: summary.files,
      scannedFileCount:
        typeof folderFileCounts[path] === "number"
          ? folderFileCounts[path]
          : null,
      duplicatePercentage:
        typeof folderFileCounts[path] === "number" && folderFileCounts[path] > 0
          ? (summary.files / folderFileCounts[path]) * 100
          : null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function sortDuplicateFolders(
  folders: DuplicateFolder[],
  sortBy: Exclude<FolderSortBy, "manual">,
  direction: SortDirection,
) {
  const directionMultiplier = direction === "ascending" ? 1 : -1;
  return [...folders].sort((left, right) => {
    if (sortBy === "percentage") {
      const leftPercentage = left.duplicatePercentage;
      const rightPercentage = right.duplicatePercentage;
      if (leftPercentage === null || rightPercentage === null) {
        if (leftPercentage !== rightPercentage) {
          return leftPercentage === null ? 1 : -1;
        }
      } else {
        const difference = leftPercentage - rightPercentage;
        if (difference !== 0) return difference * directionMultiplier;
      }
    } else {
      const countKey = sortBy === "files" ? "fileCount" : "groupCount";
      const countDifference = left[countKey] - right[countKey];
      if (countDifference !== 0) return countDifference * directionMultiplier;
    }
    return left.path.localeCompare(right.path, undefined, {
      sensitivity: "base",
    });
  });
}

/** Applies the user's custom order, appending any folders not yet ordered. */
export function applyFolderOrder(
  folders: DuplicateFolder[],
  folderOrder: string[],
): DuplicateFolder[] {
  const folderByPath = new Map(folders.map((folder) => [folder.path, folder]));
  const paths = [
    ...folderOrder.filter((path) => folderByPath.has(path)),
    ...folders
      .map((folder) => folder.path)
      .filter((path) => !folderOrder.includes(path)),
  ];
  return paths.flatMap((path) => {
    const folder = folderByPath.get(path);
    return folder ? [folder] : [];
  });
}

/** Maps each selected folder to its priority, following the displayed order. */
export function selectedFolderPositions(
  orderedFolders: DuplicateFolder[],
  selectedFolders: string[],
) {
  return new Map(
    orderedFolders
      .map((folder) => folder.path)
      .filter((path) => selectedFolders.includes(path))
      .map((path, index) => [path, index] as const),
  );
}

/**
 * Decides which copies in a group can be removed from the selected folders.
 * A copy outside the selection is kept when one exists; otherwise the copy in
 * the highest-priority selected folder is kept.
 */
export function planFolderCleanup(
  group: DuplicateGroup,
  folderPosition: Map<string, number>,
) {
  const inSelection = group.files.filter((file) =>
    folderPosition.has(folderFromPath(file.path)),
  );
  if (!inSelection.length) return null;
  const outsideSelection = group.files.filter(
    (file) => !folderPosition.has(folderFromPath(file.path)),
  );
  const byFolderOrder = [...inSelection].sort(
    (left, right) =>
      folderPosition.get(folderFromPath(left.path))! -
      folderPosition.get(folderFromPath(right.path))!,
  );
  const keptFile = outsideSelection[0] ?? byFolderOrder[0];
  const removable = byFolderOrder.filter((file) => file.path !== keptFile.path);
  return { keptFile, removable };
}
