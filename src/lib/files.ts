import type {
  DuplicateFile,
  DuplicateFolder,
  DuplicateGroup,
  FileInput,
  MoveCandidateFile,
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

export function summarizeDuplicateFolders(
  groups: DuplicateGroup[],
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
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
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
