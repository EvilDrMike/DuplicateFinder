export type DuplicateFile = {
  path: string;
  name: string;
  size: number;
  contentHash?: string;
};

export type DuplicateGroup = {
  hash: string;
  files: DuplicateFile[];
};

export type ScanResult = {
  groups: DuplicateGroup[];
  totalFiles: number;
  totalSize: number;
  folderFileCounts: Record<string, number>;
};

/** A file reference the backend re-hashes before acting on it. */
export type FileInput = {
  path: string;
  expectedHash: string;
};

export type DeleteGroup = {
  files: FileInput[];
  keptFile: FileInput;
  deleteAll: boolean;
};

export type MoveCandidateFile = DuplicateFile & {
  expectedHash: string;
};

export type MoveResult = {
  source: string;
  destination: string;
};

export type DuplicateFolder = {
  path: string;
  groupCount: number;
  fileCount: number;
  scannedFileCount: number | null;
  duplicatePercentage: number | null;
};

export type MoveSource = "files" | "folders";
export type MatchMode = "content" | "filename";
export type ResultsTab = "results" | "folders" | "move";
export type GroupSortBy = "reclaimable" | "copies" | "name" | "size";
export type SortDirection = "ascending" | "descending";
export type FolderSortBy = "manual" | "files" | "groups" | "percentage";
