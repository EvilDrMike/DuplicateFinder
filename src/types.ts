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
};

export type MoveSource = "files" | "folders";
export type MatchMode = "content" | "filename";
export type ResultsTab = "results" | "folders" | "move";
