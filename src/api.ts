import { invoke } from "@tauri-apps/api/core";
import type { PersistedSettings } from "./lib/storage";
import type { DeleteGroup, FileInput, MoveResult, ScanResult } from "./types";

/** Typed wrappers around the Tauri backend commands. */
export const api = {
  scanDirectory: (
    paths: string[],
    extensions: string[],
    matchByFilename: boolean,
  ) =>
    invoke<ScanResult>("scan_directory", {
      paths,
      extensions,
      matchByFilename,
    }),

  deleteDuplicateFiles: (groups: DeleteGroup[]) =>
    invoke<number>("delete_duplicate_files", { groups }),

  moveDuplicateFiles: (
    files: FileInput[],
    destination: string,
    scannedFolders: string[],
  ) =>
    invoke<MoveResult[]>("move_duplicate_files", {
      files,
      destination,
      scannedFolders,
    }),

  loadSettings: () => invoke<unknown>("load_settings"),

  saveSettings: (settings: PersistedSettings) =>
    invoke<void>("save_settings", { settings }),
};
