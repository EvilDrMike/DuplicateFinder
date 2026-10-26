import {
  itemsPerPageOptions,
  filterPresets,
  motionPreferences,
  uiThemes,
  type MotionPreference,
  type UiTheme,
} from "../constants";
import type { DuplicateGroup, MatchMode, MoveSource } from "../types";

const prefix = "duplicate-finder.";

export const storageKeys = {
  folders: `${prefix}folders`,
  scannedFolders: `${prefix}scanned-folders`,
  groups: `${prefix}groups`,
  totalFiles: `${prefix}total-files`,
  totalSize: `${prefix}total-size`,
  scanTimeMs: `${prefix}scan-time-ms`,
  settings: `${prefix}settings`,
} as const;

/** Keys written by older versions before settings were stored together. */
const legacySettingKeys = {
  theme: `${prefix}theme`,
  motion: `${prefix}motion`,
  matchMode: `${prefix}match-mode`,
  itemsPerPage: `${prefix}items-per-page`,
} as const;

export function readJson(key: string): unknown {
  try {
    const saved = window.localStorage.getItem(key);
    return saved === null ? undefined : JSON.parse(saved);
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readPositiveNumber(key: string) {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function writeNumber(key: string, value: number) {
  window.localStorage.setItem(key, String(value));
}

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function isDuplicateGroup(value: unknown): value is DuplicateGroup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { hash?: unknown; files?: unknown };
  return (
    typeof candidate.hash === "string" &&
    Array.isArray(candidate.files) &&
    candidate.files.every((file) => {
      if (!file || typeof file !== "object") return false;
      const candidateFile = file as {
        path?: unknown;
        name?: unknown;
        size?: unknown;
      };
      return (
        typeof candidateFile.path === "string" &&
        typeof candidateFile.name === "string" &&
        typeof candidateFile.size === "number"
      );
    })
  );
}

/** Returns the saved scan results, or null if none have been saved. */
export function loadSavedGroups(): DuplicateGroup[] | null {
  const saved = readJson(storageKeys.groups);
  return Array.isArray(saved) ? saved.filter(isDuplicateGroup) : null;
}

export type PersistedSettings = {
  theme: UiTheme;
  motion: MotionPreference;
  matchMode: MatchMode;
  itemsPerPage: number;
  fileExtensions: string;
  filterPresets: string[];
  moveDestination: string;
  moveSource: MoveSource;
  folderOrder: string[];
};

export const defaultSettings: PersistedSettings = {
  theme: "classic",
  motion: "system",
  matchMode: "content",
  itemsPerPage: 10,
  fileExtensions: "",
  filterPresets: [],
  moveDestination: "",
  moveSource: "files",
  folderOrder: [],
};

/** Keeps only the recognised, valid fields from untrusted settings data. */
export function parseSettings(value: unknown): Partial<PersistedSettings> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const settings: Partial<PersistedSettings> = {};
  const theme = uiThemes.find((item) => item.id === raw.theme);
  if (theme) settings.theme = theme.id;
  const motion = motionPreferences.find((item) => item.id === raw.motion);
  if (motion) settings.motion = motion.id;
  if (raw.matchMode === "content" || raw.matchMode === "filename") {
    settings.matchMode = raw.matchMode;
  }
  const itemsPerPage = itemsPerPageOptions.find(
    (option) => option === raw.itemsPerPage,
  );
  if (itemsPerPage) settings.itemsPerPage = itemsPerPage;
  if (typeof raw.fileExtensions === "string") {
    settings.fileExtensions = raw.fileExtensions;
  }
  if (isStringArray(raw.filterPresets)) {
    settings.filterPresets = raw.filterPresets.filter(
      (preset) => preset in filterPresets,
    );
  }
  if (typeof raw.moveDestination === "string") {
    settings.moveDestination = raw.moveDestination;
  }
  if (raw.moveSource === "files" || raw.moveSource === "folders") {
    settings.moveSource = raw.moveSource;
  }
  if (isStringArray(raw.folderOrder)) settings.folderOrder = raw.folderOrder;
  return settings;
}

function loadLegacySettings() {
  const read = (key: string) => window.localStorage.getItem(key);
  return parseSettings({
    theme: read(legacySettingKeys.theme),
    motion: read(legacySettingKeys.motion),
    matchMode: read(legacySettingKeys.matchMode),
    itemsPerPage: Number(read(legacySettingKeys.itemsPerPage)),
  });
}

export function loadLocalSettings(): PersistedSettings {
  return {
    ...defaultSettings,
    ...loadLegacySettings(),
    ...parseSettings(readJson(storageKeys.settings)),
  };
}
