import { useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import "./App.css";

declare const __APP_VERSION__: string;

type DuplicateFile = {
  path: string;
  name: string;
  size: number;
  contentHash?: string;
};

type DuplicateGroup = {
  hash: string;
  files: DuplicateFile[];
};

type ScanResult = {
  groups: DuplicateGroup[];
  totalFiles: number;
  totalSize: number;
};

type DeleteFileInput = {
  path: string;
  expectedHash: string;
};

type DeleteGroup = {
  files: DeleteFileInput[];
  keptFile: DeleteFileInput;
  deleteAll: boolean;
};

type MoveFileInput = {
  path: string;
  expectedHash: string;
};

type MoveCandidateFile = DuplicateFile & {
  expectedHash: string;
};

type MoveResult = {
  source: string;
  destination: string;
};

type MoveSource = "files" | "folders";
type MatchMode = "content" | "filename";

type ResultsTab = "results" | "folders" | "move";

const uiThemes = [
  {
    id: "classic",
    name: "Classic",
    description: "The original warm, muted DuplicateFinder look.",
  },
  {
    id: "seventies",
    name: "1970s",
    description:
      "Harvest gold, burnt orange and avocado on retro wallpaper with groovy rounded type.",
  },
  {
    id: "eighties",
    name: "1980s",
    description:
      "Memphis-style pop: hot pink, electric cyan and sunny yellow with bold black outlines.",
  },
  {
    id: "geocities",
    name: "GeoCities",
    description:
      "Welcome to my homepage! Starry tiles, Comic Sans, rainbow headings, bevelled buttons and a visitor counter.",
  },
  {
    id: "retro-future",
    name: "Retro Future",
    description:
      "Wasteland-ready phosphor terminal: glowing green monospace, CRT scanlines and inverted selections.",
  },
  {
    id: "amiga",
    name: "Amiga",
    description:
      "Workbench 2.0's four-colour palette: grey, black, white and blue with bevelled gadgets and window chrome.",
  },
  {
    id: "win311",
    name: "Windows for Workgroups 3.11",
    description:
      "Program Manager chic: navy title bar, white windows, grey push buttons and a menu bar.",
  },
  {
    id: "high-contrast",
    name: "High contrast",
    description:
      "Black background, white text and bright yellow highlights for maximum legibility.",
  },
] as const;

type UiTheme = (typeof uiThemes)[number]["id"];

const motionPreferences = [
  {
    id: "system",
    name: "Follow Windows setting",
    description: "Animations stop when Windows is set to reduce animations.",
  },
  {
    id: "always",
    name: "Always animate",
    description: "Play style animations even if Windows reduces animations.",
  },
  {
    id: "off",
    name: "No animations",
    description: "Turn style animations off everywhere.",
  },
] as const;

type MotionPreference = (typeof motionPreferences)[number]["id"];

const filterPresets = {
  Images: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff"],
  Video: ["mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v"],
  Documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"],
} as const;

const demoGroups: DuplicateGroup[] = [
  {
    hash: "demo-1",
    files: [
      {
        path: "/test-images/landscapes/lake-sunrise-alt.jpg",
        name: "lake-sunrise.jpg",
        size: 4820000,
      },
      {
        path: "/test-images/exports/lake-sunrise-copy.jpg",
        name: "lake-sunrise.jpg",
        size: 4820000,
      },
      {
        path: "/test-images/duplicates/morning-lake-backup.jpg",
        name: "lake-sunrise.jpg",
        size: 4820000,
      },
    ],
  },
  {
    hash: "demo-2",
    files: [
      {
        path: "/Documents/Invoices/2024-final.pdf",
        name: "2024-final.pdf",
        size: 1240000,
      },
      {
        path: "/Downloads/2024-final.pdf",
        name: "2024-final.pdf",
        size: 1240000,
      },
    ],
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds <= 0) return "--";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(1)}s`;
}

function isImageFile(file: DuplicateFile) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
}

function folderFromPath(filePath: string) {
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : filePath;
}

function isPathInsideFolder(path: string, folder: string) {
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

function loadItemsPerPage() {
  const savedValue = Number(
    window.localStorage.getItem("duplicate-finder.items-per-page"),
  );
  return [10, 20, 50].includes(savedValue) ? savedValue : 10;
}

function loadMatchMode(): MatchMode {
  return window.localStorage.getItem("duplicate-finder.match-mode") ===
    "filename"
    ? "filename"
    : "content";
}

function loadUiTheme(): UiTheme {
  const savedTheme = window.localStorage.getItem("duplicate-finder.theme");
  return uiThemes.find((theme) => theme.id === savedTheme)?.id ?? "classic";
}

function loadMotionPreference(): MotionPreference {
  const saved = window.localStorage.getItem("duplicate-finder.motion");
  return (
    motionPreferences.find((preference) => preference.id === saved)?.id ??
    "system"
  );
}

function loadSavedGroups() {
  try {
    const savedGroups = window.localStorage.getItem("duplicate-finder.groups");
    if (!savedGroups) return null;
    const parsedGroups: unknown = JSON.parse(savedGroups);
    if (!Array.isArray(parsedGroups)) return null;
    const groups = parsedGroups.filter((group): group is DuplicateGroup => {
      if (!group || typeof group !== "object") return false;
      const candidate = group as { hash?: unknown; files?: unknown };
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
    });
    return groups;
  } catch {
    return null;
  }
}

function loadSavedScannedFolders(fallback: string[]) {
  try {
    const savedFolders = window.localStorage.getItem(
      "duplicate-finder.scanned-folders",
    );
    if (!savedFolders) return fallback;
    const parsedFolders: unknown = JSON.parse(savedFolders);
    return Array.isArray(parsedFolders) &&
      parsedFolders.every((folder) => typeof folder === "string")
      ? parsedFolders
      : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [folders, setFolders] = useState<string[]>(() => {
    try {
      const savedFolders = window.localStorage.getItem(
        "duplicate-finder.folders",
      );
      const parsedFolders: unknown = savedFolders
        ? JSON.parse(savedFolders)
        : [];
      return Array.isArray(parsedFolders) &&
        parsedFolders.every((folder) => typeof folder === "string")
        ? parsedFolders
        : [];
    } catch {
      return [];
    }
  });
  const [scannedFolders, setScannedFolders] = useState<string[]>(() =>
    loadSavedScannedFolders(folders),
  );
  const [fileExtensions, setFileExtensions] = useState("");
  const [matchMode, setMatchMode] = useState<MatchMode>(loadMatchMode);
  const [folderInputs, setFolderInputs] = useState<string[]>([""]);
  const [activeFilterPresets, setActiveFilterPresets] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState(loadItemsPerPage);
  const [currentPage, setCurrentPage] = useState(1);
  const [groups, setGroups] = useState<DuplicateGroup[]>(
    () => loadSavedGroups() ?? demoGroups,
  );
  const [hasSavedScanResults, setHasSavedScanResults] = useState(() =>
    Boolean(loadSavedGroups()),
  );
  const [totalFilesScanned, setTotalFilesScanned] = useState(
    () =>
      Number(window.localStorage.getItem("duplicate-finder.total-files")) || 0,
  );
  const [totalSizeScanned, setTotalSizeScanned] = useState(
    () =>
      Number(window.localStorage.getItem("duplicate-finder.total-size")) || 0,
  );
  const [totalScanTimeMs, setTotalScanTimeMs] = useState(() => {
    const savedValue = Number(
      window.localStorage.getItem("duplicate-finder.scan-time-ms"),
    );
    return Number.isFinite(savedValue) && savedValue > 0 ? savedValue : 0;
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteAllGroup, setDeleteAllGroup] = useState<string | null>(null);
  const [keptFiles, setKeptFiles] = useState<Record<string, string>>({});
  const [previewPath, setPreviewPath] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [moveDestination, setMoveDestination] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isScanLocationsCollapsed, setIsScanLocationsCollapsed] = useState(() =>
    Boolean(loadSavedGroups()?.length),
  );
  const [activeResultsTab, setActiveResultsTab] =
    useState<ResultsTab>("results");
  const [moveSource, setMoveSource] = useState<MoveSource>("files");
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uiTheme, setUiTheme] = useState<UiTheme>(loadUiTheme);
  const [motionPreference, setMotionPreference] =
    useState<MotionPreference>(loadMotionPreference);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1);
  const [status, setStatus] = useState("Demo results loaded");
  const appVersion = __APP_VERSION__;
  const isDeleteAllMode = deleteAllGroup !== null;

  const duplicateCount = groups.reduce(
    (count, group) => count + group.files.length - 1,
    0,
  );
  const reclaimable = groups.reduce(
    (total, group) =>
      total +
      group.files
        .filter((file) =>
          deleteAllGroup === group.hash
            ? true
            : file.path !== (keptFiles[group.hash] ?? group.files[0].path),
        )
        .reduce((sum, file) => sum + file.size, 0),
    0,
  );
  const selectedBytes = useMemo(
    () =>
      groups
        .filter((group) => selected.includes(group.hash))
        .reduce(
          (total, group) =>
            total +
            group.files
              .filter(
                (file) =>
                  file.path !== (keptFiles[group.hash] ?? group.files[0].path),
              )
              .reduce((sum, file) => sum + file.size, 0),
          0,
        ),
    [groups, selected, keptFiles],
  );
  const totalPages = Math.max(1, Math.ceil(groups.length / itemsPerPage));
  const visibleGroups = groups.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );
  const duplicateFolders = useMemo(() => {
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
  }, [groups]);
  const orderedDuplicateFolders = useMemo(() => {
    const folderByPath = new Map(
      duplicateFolders.map((folder) => [folder.path, folder]),
    );
    const paths = [
      ...folderOrder.filter((path) => folderByPath.has(path)),
      ...duplicateFolders
        .map((folder) => folder.path)
        .filter((path) => !folderOrder.includes(path)),
    ];
    return paths.flatMap((path) => {
      const folder = folderByPath.get(path);
      return folder ? [folder] : [];
    });
  }, [duplicateFolders, folderOrder]);

  function moveFolder(path: string, direction: -1 | 1) {
    const paths = orderedDuplicateFolders.map((folder) => folder.path);
    const currentIndex = paths.indexOf(path);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= paths.length) {
      return;
    }
    [paths[currentIndex], paths[targetIndex]] = [
      paths[targetIndex],
      paths[currentIndex],
    ];
    setFolderOrder(paths);
  }

  useEffect(() => {
    window.localStorage.setItem(
      "duplicate-finder.folders",
      JSON.stringify(folders),
    );
  }, [folders]);

  useEffect(() => {
    window.localStorage.setItem(
      "duplicate-finder.scanned-folders",
      JSON.stringify(scannedFolders),
    );
  }, [scannedFolders]);

  useEffect(() => {
    if (!hasSavedScanResults) return;
    window.localStorage.setItem(
      "duplicate-finder.groups",
      JSON.stringify(groups),
    );
  }, [groups, hasSavedScanResults]);

  useEffect(() => {
    if (!hasSavedScanResults) return;
    window.localStorage.setItem(
      "duplicate-finder.total-files",
      String(totalFilesScanned),
    );
    window.localStorage.setItem(
      "duplicate-finder.total-size",
      String(totalSizeScanned),
    );
    window.localStorage.setItem(
      "duplicate-finder.scan-time-ms",
      String(totalScanTimeMs),
    );
  }, [
    hasSavedScanResults,
    totalFilesScanned,
    totalSizeScanned,
    totalScanTimeMs,
  ]);

  useEffect(() => {
    window.localStorage.setItem(
      "duplicate-finder.items-per-page",
      String(itemsPerPage),
    );
  }, [itemsPerPage]);

  useEffect(() => {
    window.localStorage.setItem("duplicate-finder.match-mode", matchMode);
  }, [matchMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    window.localStorage.setItem("duplicate-finder.theme", uiTheme);
  }, [uiTheme]);

  useEffect(() => {
    document.documentElement.dataset.motion = motionPreference;
    window.localStorage.setItem("duplicate-finder.motion", motionPreference);
  }, [motionPreference]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!isPreviewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPreviewOpen]);

  useEffect(() => {
    if (!previewPath && groups[0]?.files[0]) {
      setPreviewPath(groups[0].files[0].path);
    }
  }, [groups, previewPath]);

  async function chooseFolders() {
    let chosen: string | string[] | null;
    try {
      chosen = await open({
        directory: true,
        multiple: true,
        title: "Choose folders to scan",
      });
    } catch {
      setStatus("Folder browsing is available in the desktop app.");
      return;
    }
    if (!chosen) return;
    const newFolders = Array.isArray(chosen) ? chosen : [chosen];
    setFolders((current) => [
      ...current,
      ...newFolders.filter((path) => !current.includes(path)),
    ]);
    setStatus("Folders ready to scan");
  }

  async function chooseMoveDestination() {
    try {
      const chosen = await open({
        directory: true,
        multiple: false,
        title: "Choose a destination folder",
      });
      if (typeof chosen === "string") setMoveDestination(chosen);
    } catch {
      setMoveError(
        "Choosing a destination folder is available in the desktop app.",
      );
    }
  }

  function updateFolderInput(index: number, value: string) {
    setFolderInputs((current) =>
      current.map((folder, folderIndex) =>
        folderIndex === index ? value : folder,
      ),
    );
  }

  function addTypedFolder(index: number) {
    const folder = folderInputs[index].trim();
    if (!folder) return;
    setFolders((current) =>
      current.includes(folder) ? current : [...current, folder],
    );
    setFolderInputs((current) =>
      current.map((value, inputIndex) => (inputIndex === index ? "" : value)),
    );
    setStatus("Folder added to scan list");
  }

  function removeFolder(folderToRemove: string) {
    setFolders((current) =>
      current.filter((folder) => folder !== folderToRemove),
    );
  }

  function clearFolders() {
    setFolders([]);
    setScannedFolders([]);
    setFolderInputs([""]);
    setGroups([]);
    setHasSavedScanResults(true);
    setTotalFilesScanned(0);
    setTotalSizeScanned(0);
    setTotalScanTimeMs(0);
    setSelected([]);
    setSelectedFolders([]);
    setDeleteAllGroup(null);
    setKeptFiles({});
    setPreviewPath("");
    setPreviewError(false);
    setIsScanLocationsCollapsed(false);
    setCurrentPage(1);
    setStatus("All selected folders cleared");
  }

  function normalizedExtensions() {
    const customExtensions = fileExtensions
      .split(",")
      .map((extension) => extension.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);
    const presetExtensions = activeFilterPresets.flatMap(
      (preset) => filterPresets[preset as keyof typeof filterPresets],
    );
    return [...new Set([...customExtensions, ...presetExtensions])];
  }

  function toggleFilterPreset(preset: string) {
    setActiveFilterPresets((current) =>
      current.includes(preset)
        ? current.filter((item) => item !== preset)
        : [...current, preset],
    );
  }

  async function scan() {
    if (!folders.length) {
      setStatus("Choose at least one folder before scanning.");
      return;
    }
    setIsScanning(true);
    setStatus("Scanning files...");
    const scanStartedAt = performance.now();
    try {
      const result = await invoke<ScanResult>("scan_directory", {
        paths: folders,
        extensions: normalizedExtensions(),
        matchByFilename: matchMode === "filename",
      });
      setTotalScanTimeMs(Math.max(performance.now() - scanStartedAt, 1));
      setGroups(result.groups);
      setScannedFolders(folders);
      setHasSavedScanResults(true);
      setTotalFilesScanned(result.totalFiles);
      setTotalSizeScanned(result.totalSize);
      setSelected([]);
      setSelectedFolders([]);
      setDeleteAllGroup(null);
      setKeptFiles({});
      setPreviewPath(result.groups[0]?.files[0]?.path ?? "");
      setPreviewError(false);
      setStatus(
        `Scan complete · ${result.groups.length} duplicate groups found`,
      );
      setIsScanLocationsCollapsed(result.groups.length > 0);
      setCurrentPage(1);
    } catch {
      setTotalScanTimeMs(0);
      setGroups(demoGroups);
      setScannedFolders([]);
      setTotalFilesScanned(0);
      setTotalSizeScanned(0);
      setSelected([]);
      setSelectedFolders([]);
      setDeleteAllGroup(null);
      setKeptFiles({});
      setPreviewPath(demoGroups[0].files[0].path);
      setPreviewError(false);
      setStatus("Preview results loaded · scan folders from the desktop app");
      setIsScanLocationsCollapsed(false);
      setCurrentPage(1);
    } finally {
      setIsScanning(false);
    }
  }

  async function deleteSelectedFiles() {
    const groupsToDelete: DeleteGroup[] = groups
      .filter((group) => selected.includes(group.hash))
      .map((group) => {
        const keptFile =
          group.files.find(
            (file) =>
              file.path === (keptFiles[group.hash] ?? group.files[0].path),
          ) ?? group.files[0];
        return {
          files: group.files.map((file) => ({
            path: file.path,
            expectedHash: file.contentHash ?? group.hash,
          })),
          keptFile: {
            path: keptFile.path,
            expectedHash: keptFile.contentHash ?? group.hash,
          },
          deleteAll: false,
        };
      });
    if (!groupsToDelete.length) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const deletedCount = await invoke<number>("delete_duplicate_files", {
        groups: groupsToDelete,
      });
      setGroups((current) =>
        current.filter((group) => !selected.includes(group.hash)),
      );
      setSelected([]);
      setKeptFiles({});
      setStatus(
        `${deletedCount} duplicate file${deletedCount === 1 ? "" : "s"} deleted`,
      );
    } catch (error) {
      setDeleteError(String(error));
      setStatus("Delete aborted");
    } finally {
      setIsDeleting(false);
    }
  }

  async function deleteAllCopiesInGroup(group: DuplicateGroup) {
    const keptFile = group.files[0];
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const deletedCount = await invoke<number>("delete_duplicate_files", {
        groups: [
          {
            files: group.files.map((file) => ({
              path: file.path,
              expectedHash: file.contentHash ?? group.hash,
            })),
            keptFile: {
              path: keptFile.path,
              expectedHash: keptFile.contentHash ?? group.hash,
            },
            deleteAll: true,
          } satisfies DeleteGroup,
        ],
      });
      const deletedPaths = new Set(group.files.map((file) => file.path));
      setGroups((current) =>
        current.filter((item) => item.hash !== group.hash),
      );
      setSelected((current) => current.filter((hash) => hash !== group.hash));
      setKeptFiles(({ [group.hash]: _removed, ...rest }) => rest);
      if (deletedPaths.has(previewPath)) {
        setPreviewPath("");
        setPreviewError(false);
      }
      setStatus(
        `${deletedCount} file${deletedCount === 1 ? "" : "s"} deleted (all copies)`,
      );
    } catch (error) {
      setDeleteError(String(error));
      setStatus("Delete aborted");
    } finally {
      setDeleteAllGroup(null);
      setIsDeleting(false);
    }
  }

  async function moveSelectedDuplicates() {
    if (
      !moveDestination ||
      moveDestinationInsideScannedFolder ||
      !moveCandidateFiles.length
    ) {
      return;
    }
    setIsMoving(true);
    setMoveError(null);
    try {
      const movedFiles = await invoke<MoveResult[]>("move_duplicate_files", {
        files: moveCandidateFiles.map(
          ({ path, expectedHash }): MoveFileInput => ({ path, expectedHash }),
        ),
        destination: moveDestination,
        scannedFolders,
      });
      const destinations = new Map(
        movedFiles.map((file) => [file.source, file.destination]),
      );
      setGroups((current) =>
        current.map((group) => ({
          ...group,
          files: group.files.map((file) => {
            const destination = destinations.get(file.path);
            return destination ? { ...file, path: destination } : file;
          }),
        })),
      );
      setPreviewPath((current) => destinations.get(current) ?? current);
      setSelected([]);
      setSelectedFolders([]);
      setStatus(
        `${movedFiles.length} duplicate ${movedFiles.length === 1 ? "copy" : "copies"} moved`,
      );
    } catch (error) {
      setMoveError(String(error));
      setStatus("Move aborted");
    } finally {
      setIsMoving(false);
    }
  }

  async function deleteDuplicatesFromSelectedFolders() {
    if (!selectedFolders.length) return;
    const selectedFolderOrder = orderedDuplicateFolders
      .map((folder) => folder.path)
      .filter((path) => selectedFolders.includes(path));
    const folderPosition = new Map(
      selectedFolderOrder.map((path, index) => [path, index]),
    );
    const groupsToDelete: DeleteGroup[] = groups
      .map((group) => {
        const filesInSelectedFolders = group.files.filter((file) =>
          folderPosition.has(folderFromPath(file.path)),
        );
        if (!filesInSelectedFolders.length) return null;
        const filesInUnselectedFolders = group.files.filter(
          (file) => !folderPosition.has(folderFromPath(file.path)),
        );
        const filesByFolderOrder = filesInSelectedFolders.sort(
          (left, right) =>
            folderPosition.get(folderFromPath(left.path))! -
            folderPosition.get(folderFromPath(right.path))!,
        );
        const keptFile =
          filesInUnselectedFolders[0]?.path ?? filesByFolderOrder[0]?.path;
        if (!keptFile) return null;
        const filesToDelete = filesByFolderOrder
          .filter((file) => file.path !== keptFile)
          .reverse();
        if (!filesToDelete.length) return null;
        const keptFileDetails =
          group.files.find((file) => file.path === keptFile) ?? group.files[0];
        return {
          files: filesToDelete.map((file) => ({
            path: file.path,
            expectedHash: file.contentHash ?? group.hash,
          })),
          keptFile: {
            path: keptFileDetails.path,
            expectedHash: keptFileDetails.contentHash ?? group.hash,
          },
          deleteAll: false,
        };
      })
      .filter((group): group is DeleteGroup => group !== null);
    if (!groupsToDelete.length) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const deletedCount = await invoke<number>("delete_duplicate_files", {
        groups: groupsToDelete,
      });
      const deletedPaths = new Set(
        groupsToDelete.flatMap((group) => group.files.map((file) => file.path)),
      );
      setGroups((current) =>
        current
          .map((group) => ({
            ...group,
            files: group.files.filter((file) => !deletedPaths.has(file.path)),
          }))
          .filter((group) => group.files.length > 1),
      );
      setSelectedFolders([]);
      setSelected([]);
      setKeptFiles({});
      if (deletedPaths.has(previewPath)) {
        setPreviewPath("");
        setPreviewError(false);
      }
      setStatus(
        `${deletedCount} duplicate file${deletedCount === 1 ? "" : "s"} deleted from selected folders`,
      );
    } catch (error) {
      setDeleteError(String(error));
      setStatus("Delete aborted");
    } finally {
      setIsDeleting(false);
    }
  }

  const previewFile = groups
    .flatMap((group) => group.files)
    .find((file) => file.path === previewPath);
  const previewGroupImages =
    groups
      .find((group) => group.files.some((file) => file.path === previewPath))
      ?.files.filter(isImageFile) ?? [];
  const previewImageIndex = previewGroupImages.findIndex(
    (file) => file.path === previewPath,
  );

  function cyclePreview(direction: -1 | 1) {
    const nextImage = previewGroupImages[previewImageIndex + direction];
    if (previewImageIndex < 0 || !nextImage) return;
    setPreviewPath(nextImage.path);
    setPreviewError(false);
  }

  useEffect(() => {
    if (!isPreviewOpen) return;
    const handleArrowKeys = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") cyclePreview(-1);
      if (event.key === "ArrowRight") cyclePreview(1);
    };
    window.addEventListener("keydown", handleArrowKeys);
    return () => window.removeEventListener("keydown", handleArrowKeys);
  });
  const selectedMoveFiles: MoveCandidateFile[] = groups
    .filter((group) => selected.includes(group.hash))
    .flatMap((group) => {
      const keptFile = keptFiles[group.hash] ?? group.files[0].path;
      return group.files
        .filter((file) => file.path !== keptFile)
        .map((file) => ({
          ...file,
          expectedHash: file.contentHash ?? group.hash,
        }));
    });
  const selectedFolderMoveFiles: MoveCandidateFile[] = (() => {
    const selectedFolderOrder = orderedDuplicateFolders
      .map((folder) => folder.path)
      .filter((path) => selectedFolders.includes(path));
    const folderPosition = new Map(
      selectedFolderOrder.map((path, index) => [path, index]),
    );
    return groups.flatMap((group) => {
      const filesInSelectedFolders = group.files.filter((file) =>
        folderPosition.has(folderFromPath(file.path)),
      );
      if (!filesInSelectedFolders.length) return [];
      const filesInUnselectedFolders = group.files.filter(
        (file) => !folderPosition.has(folderFromPath(file.path)),
      );
      const filesByFolderOrder = filesInSelectedFolders.sort(
        (left, right) =>
          folderPosition.get(folderFromPath(left.path))! -
          folderPosition.get(folderFromPath(right.path))!,
      );
      const keptFile =
        filesInUnselectedFolders[0]?.path ?? filesByFolderOrder[0]?.path;
      return filesByFolderOrder
        .filter((file) => file.path !== keptFile)
        .map((file) => ({
          ...file,
          expectedHash: file.contentHash ?? group.hash,
        }));
    });
  })();
  const moveCandidateFiles =
    moveSource === "files" ? selectedMoveFiles : selectedFolderMoveFiles;
  const filesPerSecond =
    totalScanTimeMs > 0 ? totalFilesScanned / (totalScanTimeMs / 1000) : 0;
  const moveDestinationInsideScannedFolder = scannedFolders.some((folder) =>
    isPathInsideFolder(moveDestination, folder),
  );
  const previewSource = previewPath.startsWith("/test-images/")
    ? previewPath
    : convertFileSrc(previewPath);

  function previewFileFromGroup(groupHash: string, file: DuplicateFile) {
    setPreviewPath(file.path);
    setPreviewError(false);
    if (isImageFile(file)) {
      setSelected((current) =>
        current.includes(groupHash) ? current : [...current, groupHash],
      );
    }
  }

  async function revealInExplorer(filePath: string) {
    try {
      await revealItemInDir(filePath);
    } catch {
      setStatus("Explorer reveal is available in the desktop app.");
    }
  }

  return (
    <main className={`app-shell ${isDeleteAllMode ? "delete-all-mode" : ""}`}>
      <header className="topbar locked-region" inert={isDeleteAllMode}>
        <div className="brand">
          <span className="brand-mark">DF</span>
          <span>DuplicateFinder</span>
        </div>
        <div className="topbar-actions">
          <button
            className="about-button"
            onClick={() => setIsSettingsOpen(true)}
            type="button">
            Settings
          </button>
          <button
            className="about-button"
            onClick={() => setIsAboutOpen(true)}
            type="button">
            About
          </button>
        </div>
      </header>

      {isSettingsOpen && (
        <div
          className="about-backdrop"
          role="presentation"
          onClick={() => setIsSettingsOpen(false)}>
          <section
            className="about-dialog settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(event) => event.stopPropagation()}>
            <div className="about-dialog-heading">
              <p className="eyebrow">SETTINGS</p>
              <button
                className="about-close"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Close settings"
                type="button">
                ×
              </button>
            </div>
            <h2 id="settings-title">Appearance</h2>
            <fieldset className="theme-options">
              <legend>Interface style</legend>
              {uiThemes.map((theme) => (
                <label
                  className={`theme-option ${uiTheme === theme.id ? "active" : ""}`}
                  key={theme.id}>
                  <input
                    type="radio"
                    name="ui-theme"
                    value={theme.id}
                    checked={uiTheme === theme.id}
                    onChange={() => setUiTheme(theme.id)}
                  />
                  <span className={`theme-swatch swatch-${theme.id}`} />
                  <span className="theme-option-text">
                    <strong>{theme.name}</strong>
                    <span>{theme.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="theme-options motion-options">
              <legend>Animations</legend>
              {motionPreferences.map((preference) => (
                <label
                  className={`theme-option compact ${motionPreference === preference.id ? "active" : ""}`}
                  key={preference.id}>
                  <input
                    type="radio"
                    name="motion-preference"
                    value={preference.id}
                    checked={motionPreference === preference.id}
                    onChange={() => setMotionPreference(preference.id)}
                  />
                  <span className="theme-option-text">
                    <strong>{preference.name}</strong>
                    <span>{preference.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>
        </div>
      )}

      {isAboutOpen && (
        <div
          className="about-backdrop"
          role="presentation"
          onClick={() => setIsAboutOpen(false)}>
          <section
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(event) => event.stopPropagation()}>
            <div className="about-dialog-heading">
              <p className="eyebrow">ABOUT DUPLICATEFINDER</p>
              <button
                className="about-close"
                onClick={() => setIsAboutOpen(false)}
                aria-label="Close About dialog"
                type="button">
                ×
              </button>
            </div>
            <h2 id="about-title">
              Find the files
              <br />
              <em>you can let go of.</em>
            </h2>
            <p>
              Scan a folder, review what is truly duplicated, and reclaim space
              with confidence.
            </p>
            <span className="about-note">
              DuplicateFinder matches by filename or file content locally. Your
              files stay on this device.
            </span>
            <div className="about-version">Version {appVersion}</div>
          </section>
        </div>
      )}

      {isPreviewOpen && previewFile && isImageFile(previewFile) && (
        <div
          className="about-backdrop preview-modal-backdrop"
          role="presentation"
          onClick={() => setIsPreviewOpen(false)}>
          <figure
            className="preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview of ${previewFile.name}`}
            onClick={(event) => event.stopPropagation()}>
            <img
              src={previewSource}
              alt={`Preview of ${previewFile.name}`}
              style={{
                aspectRatio: previewAspectRatio,
                width: `min(90vw, calc(90vh * ${previewAspectRatio}))`,
              }}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth && naturalHeight) {
                  setPreviewAspectRatio(naturalWidth / naturalHeight);
                }
              }}
            />
            <button
              className="preview-modal-close"
              onClick={() => setIsPreviewOpen(false)}
              aria-label="Close preview"
              autoFocus
              type="button">
              ×
            </button>
            {previewGroupImages.length > 1 && (
              <>
                <button
                  className="preview-modal-nav prev"
                  onClick={() => cyclePreview(-1)}
                  disabled={previewImageIndex <= 0}
                  aria-label="Previous image in group"
                  type="button">
                  ‹
                </button>
                <button
                  className="preview-modal-nav next"
                  onClick={() => cyclePreview(1)}
                  disabled={previewImageIndex >= previewGroupImages.length - 1}
                  aria-label="Next image in group"
                  type="button">
                  ›
                </button>
                <figcaption className="preview-modal-caption">
                  {previewImageIndex + 1} / {previewGroupImages.length} ·{" "}
                  <span title={previewPath}>{previewPath}</span>
                </figcaption>
              </>
            )}
          </figure>
        </div>
      )}

      {deleteError && (
        <div
          className="about-backdrop"
          role="presentation"
          onClick={() => setDeleteError(null)}>
          <section
            className="about-dialog delete-error-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-error-title"
            onClick={(event) => event.stopPropagation()}>
            <div className="about-dialog-heading">
              <p className="eyebrow">DELETE ABORTED</p>
              <button
                className="about-close"
                onClick={() => setDeleteError(null)}
                aria-label="Close delete warning"
                type="button">
                ×
              </button>
            </div>
            <h2 id="delete-error-title">Scan is out of date.</h2>
            <p>{deleteError}</p>
            <p className="delete-error-help">
              No files were deleted. Rescan the selected folders before trying
              again.
            </p>
            <button
              className="scan-button delete-error-action"
              onClick={() => setDeleteError(null)}
              type="button">
              Close warning
            </button>
          </section>
        </div>
      )}

      <section className="scan-panel locked-region" inert={isDeleteAllMode}>
        <button
          className="scan-panel-header"
          onClick={() => setIsScanLocationsCollapsed((collapsed) => !collapsed)}
          aria-expanded={!isScanLocationsCollapsed}
          type="button">
          <span className="panel-label">
            <span className="pulse" /> SCAN LOCATIONS
          </span>
          <span className="scan-panel-toggle">
            {isScanLocationsCollapsed
              ? `${groups.length} groups found · Rescan`
              : "Collapse"}
            <span aria-hidden="true">
              {isScanLocationsCollapsed ? "↓" : "↑"}
            </span>
          </span>
        </button>
        {!isScanLocationsCollapsed && (
          <div className="scan-panel-content">
            <div className="folder-picker-row">
              <div>
                <strong>Choose folders to compare</strong>
                <span>Select as many locations as you need.</span>
              </div>
              <div className="folder-actions">
                <button
                  className="clear-folders-button"
                  onClick={clearFolders}
                  disabled={!folders.length || isScanning}
                  type="button">
                  Clear all
                </button>
                <button
                  className="browse-button"
                  onClick={() => void chooseFolders()}
                  disabled={isScanning}>
                  Browse
                </button>
              </div>
            </div>
            <div className="manual-folder-inputs">
              {folderInputs.map((folderInput, index) => (
                <div className="manual-folder-row" key={index}>
                  <input
                    value={folderInput}
                    onChange={(event) =>
                      updateFolderInput(index, event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addTypedFolder(index);
                    }}
                    placeholder="Type or paste a folder path"
                    aria-label={`Folder path ${index + 1}`}
                  />
                  <button
                    className="add-path-button"
                    onClick={() => addTypedFolder(index)}
                    disabled={!folderInput.trim()}
                    type="button">
                    Add
                  </button>
                </div>
              ))}
            </div>
            <div className="folder-list-heading">
              <span>Selected folders ({folders.length})</span>
            </div>
            <div className="folder-list" aria-live="polite">
              {folders.length === 0 ? (
                <div className="folder-empty">No folders selected yet</div>
              ) : (
                folders.map((selectedFolder) => (
                  <div className="folder-item" key={selectedFolder}>
                    <span className="folder-symbol">/</span>
                    <span className="folder-name" title={selectedFolder}>
                      {selectedFolder}
                    </span>
                    <button
                      className="remove-folder"
                      onClick={() => removeFolder(selectedFolder)}
                      aria-label={`Remove ${selectedFolder}`}
                      title="Remove folder">
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="filter-row">
              <label htmlFor="file-extensions">File types</label>
              <input
                id="file-extensions"
                className="filter-input"
                value={fileExtensions}
                onChange={(event) =>
                  setFileExtensions(event.currentTarget.value)
                }
                placeholder="All file types, or e.g. jpg, png, pdf"
                aria-describedby="file-extensions-help"
              />
              <span id="file-extensions-help">
                Separate extensions with commas.
              </span>
              <div
                className="filter-presets"
                aria-label="Common file type filters">
                {Object.keys(filterPresets).map((preset) => {
                  const isActive = activeFilterPresets.includes(preset);
                  return (
                    <button
                      className={`filter-preset ${isActive ? "active" : ""}`}
                      key={preset}
                      onClick={() => toggleFilterPreset(preset)}
                      aria-pressed={isActive}
                      type="button">
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="match-mode-row">
              <div>
                <strong>Match duplicates by</strong>
                <span>
                  {matchMode === "content"
                    ? "Compare file contents and sizes."
                    : "Group files with the same filename, case-insensitively, even if their contents differ."}
                </span>
              </div>
              <div
                className="match-mode-control"
                role="group"
                aria-label="Duplicate matching method">
                <button
                  className={matchMode === "content" ? "active" : ""}
                  onClick={() => setMatchMode("content")}
                  aria-pressed={matchMode === "content"}
                  type="button">
                  Content
                </button>
                <button
                  className={matchMode === "filename" ? "active" : ""}
                  onClick={() => setMatchMode("filename")}
                  aria-pressed={matchMode === "filename"}
                  type="button">
                  Filename
                </button>
              </div>
            </div>
            <div className="scan-action-row">
              <button
                className="scan-button"
                onClick={scan}
                disabled={isScanning || !folders.length}>
                {isScanning ? "Scanning..." : "Scan selected folders"}
                <span>→</span>
              </button>
            </div>
            <p className="status">{status}</p>
          </div>
        )}
      </section>

      <section className="summary-grid locked-region" inert={isDeleteAllMode}>
        <div>
          <span>Files scanned</span>
          <strong>{totalFilesScanned.toLocaleString()}</strong>
          <small>matching the current filter</small>
        </div>
        <div>
          <span>Total scan time</span>
          <strong>{formatDuration(totalScanTimeMs)}</strong>
          <small>last completed scan</small>
        </div>
        <div>
          <span>Files per second</span>
          <strong>
            {totalScanTimeMs > 0
              ? Math.round(filesPerSecond).toLocaleString()
              : "--"}
          </strong>
          <small>average scan rate</small>
        </div>
        <div>
          <span>Total scanned size</span>
          <strong>{formatBytes(totalSizeScanned)}</strong>
          <small>across selected folders</small>
        </div>
        <div>
          <span>Duplicate groups</span>
          <strong>{groups.length}</strong>
          <small>clusters of identical files</small>
        </div>
        <div>
          <span>Extra copies</span>
          <strong>{duplicateCount}</strong>
          <small>safe to review</small>
        </div>
        <div className="accent-stat">
          <span>Potentially reclaimable</span>
          <strong>{formatBytes(reclaimable)}</strong>
          <small>excluding your originals</small>
        </div>
      </section>

      <section className="results-section">
        <div
          className="results-tabs locked-region"
          inert={isDeleteAllMode}
          role="tablist"
          aria-label="Duplicate results views">
          <button
            className={activeResultsTab === "results" ? "active" : ""}
            onClick={() => setActiveResultsTab("results")}
            role="tab"
            aria-selected={activeResultsTab === "results"}
            type="button">
            Files
          </button>
          <button
            className={activeResultsTab === "folders" ? "active" : ""}
            onClick={() => setActiveResultsTab("folders")}
            role="tab"
            aria-selected={activeResultsTab === "folders"}
            type="button">
            Folder
          </button>
          <button
            className={activeResultsTab === "move" ? "active" : ""}
            onClick={() => setActiveResultsTab("move")}
            role="tab"
            aria-selected={activeResultsTab === "move"}
            type="button">
            Move
          </button>
        </div>
        <div className="section-heading locked-region" inert={isDeleteAllMode}>
          <div>
            <p className="eyebrow">REVIEW RESULTS</p>
            <h2>
              {activeResultsTab === "results"
                ? "Duplicate groups"
                : activeResultsTab === "folders"
                  ? "Folders with duplicates"
                  : "Move duplicate copies"}
            </h2>
          </div>
          {activeResultsTab === "results" && (
            <div className="results-settings">
              <label htmlFor="items-per-page">Items per page</label>
              <select
                id="items-per-page"
                value={itemsPerPage}
                onChange={(event) => {
                  setItemsPerPage(Number(event.currentTarget.value));
                  setCurrentPage(1);
                }}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="sort">Largest first&nbsp; ↓</span>
            </div>
          )}
        </div>
        {activeResultsTab === "move" ? (
          <div className="move-panel" role="tabpanel">
            <div className="move-destination-row">
              <div>
                <strong>Destination folder</strong>
                <span>
                  Kept files stay put; moved files keep folders below their
                  common parent.
                </span>
              </div>
              <div className="move-destination-control">
                <input
                  value={moveDestination}
                  placeholder="Choose a destination folder"
                  aria-label="Move destination folder"
                  readOnly
                />
                <button
                  className="browse-button"
                  onClick={() => void chooseMoveDestination()}
                  disabled={isMoving}
                  type="button">
                  Browse
                </button>
              </div>
            </div>
            {moveDestinationInsideScannedFolder && (
              <p className="move-error" role="alert">
                Choose a destination outside every folder searched for
                duplicates.
              </p>
            )}
            {moveError && !moveDestinationInsideScannedFolder && (
              <p className="move-error" role="alert">
                {moveError}
              </p>
            )}
            <div
              className="move-source-control"
              role="group"
              aria-label="Move selection source">
              <button
                className={moveSource === "files" ? "active" : ""}
                onClick={() => setMoveSource("files")}
                aria-pressed={moveSource === "files"}
                type="button">
                Files ({selectedMoveFiles.length})
              </button>
              <button
                className={moveSource === "folders" ? "active" : ""}
                onClick={() => setMoveSource("folders")}
                aria-pressed={moveSource === "folders"}
                type="button">
                Folders ({selectedFolderMoveFiles.length})
              </button>
            </div>
            <div className="move-selection-heading">
              <strong>
                {moveCandidateFiles.length} duplicate copies selected
              </strong>
              <span>
                {moveSource === "files"
                  ? "Select groups in Files to choose which copies to move."
                  : "Select folders in Folder. Copies outside the selection stay put; folder order chooses a copy to keep when all copies are selected."}
              </span>
            </div>
            {moveCandidateFiles.length ? (
              <div className="move-file-list">
                {moveCandidateFiles.map((file) => (
                  <div className="move-file-row" key={file.path}>
                    <strong>{file.name}</strong>
                    <span title={file.path}>{file.path}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>
                  {moveSource === "files"
                    ? "No duplicate copies selected"
                    : "No duplicate copies selected from folders"}
                </strong>
                <span>
                  {moveSource === "files"
                    ? "Select duplicate groups in Files to move their extra copies."
                    : "Select folders in Folder to move duplicate copies from those locations."}
                </span>
              </div>
            )}
          </div>
        ) : activeResultsTab === "folders" ? (
          <div className="folder-results" role="tabpanel">
            {duplicateFolders.length > 0 && (
              <label className="folder-select-all">
                <input
                  type="checkbox"
                  checked={
                    orderedDuplicateFolders.length > 0 &&
                    orderedDuplicateFolders.every((folder) =>
                      selectedFolders.includes(folder.path),
                    )
                  }
                  onChange={(event) =>
                    setSelectedFolders(
                      event.currentTarget.checked
                        ? orderedDuplicateFolders.map((folder) => folder.path)
                        : [],
                    )
                  }
                  aria-label="Select all folders"
                />
                <span>Select all folders</span>
              </label>
            )}
            {duplicateFolders.length === 0 ? (
              <div className="empty-state">
                <strong>No duplicate folders found</strong>
                <span>
                  Folders containing duplicate files will appear here.
                </span>
              </div>
            ) : (
              orderedDuplicateFolders.map((folder, index) => (
                <div className="duplicate-folder" key={folder.path}>
                  <label className="folder-select-control">
                    <input
                      type="checkbox"
                      checked={selectedFolders.includes(folder.path)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectedFolders((current) =>
                          checked
                            ? [...current, folder.path]
                            : current.filter((path) => path !== folder.path),
                        );
                      }}
                      aria-label={`Select ${folder.path}`}
                    />
                  </label>
                  <span className="folder-symbol">/</span>
                  <span className="duplicate-folder-path" title={folder.path}>
                    {folder.path}
                  </span>
                  <span className="duplicate-folder-count">
                    {folder.groupCount}{" "}
                    {folder.groupCount === 1 ? "group" : "groups"} ·{" "}
                    {folder.fileCount} files
                  </span>
                  <span className="folder-reorder-controls">
                    <button
                      type="button"
                      onClick={() => moveFolder(folder.path, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${folder.path} up`}
                      title="Move folder up">
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveFolder(folder.path, 1)}
                      disabled={index === orderedDuplicateFolders.length - 1}
                      aria-label={`Move ${folder.path} down`}
                      title="Move folder down">
                      ↓
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="results-grid" role="tabpanel">
            <div className="group-list">
              {groups.length === 0 ? (
                <div className="empty-state">
                  <strong>No duplicates found</strong>
                  <span>This folder is already wonderfully tidy.</span>
                </div>
              ) : (
                visibleGroups.map((group, index) => {
                  const isSelected = selected.includes(group.hash);
                  const isDeleteAll = deleteAllGroup === group.hash;
                  const isLockedGroup = isDeleteAllMode && !isDeleteAll;
                  const keptFile = keptFiles[group.hash] ?? group.files[0].path;
                  const keptFileDetails =
                    group.files.find((file) => file.path === keptFile) ??
                    group.files[0];
                  const groupSize = group.files
                    .filter((file) => file.path !== keptFile)
                    .reduce((total, file) => total + file.size, 0);
                  return (
                    <article
                      className={`duplicate-group ${isSelected ? "selected" : ""} ${isDeleteAll ? "delete-all-selected" : ""} ${isLockedGroup ? "locked-region" : ""}`}
                      inert={isLockedGroup}
                      key={group.hash}>
                      <button
                        className="group-toggle"
                        disabled={isDeleteAllMode}
                        onClick={() => {
                          setSelected((current) =>
                            isSelected
                              ? current.filter((hash) => hash !== group.hash)
                              : [...current, group.hash],
                          );
                        }}
                        aria-label={`Select group ${(currentPage - 1) * itemsPerPage + index + 1}`}>
                        <span>{isSelected ? "✓" : ""}</span>
                      </button>
                      <div className="group-main">
                        <div className="group-title">
                          <span
                            className={`file-type type-${keptFileDetails.name.split(".").pop()}`}>
                            {keptFileDetails.name
                              .split(".")
                              .pop()
                              ?.toUpperCase()}
                          </span>
                          <strong>{keptFileDetails.name}</strong>
                          <span>
                            {group.files.length} copies ·{" "}
                            {formatBytes(groupSize)}{" "}
                          </span>
                          <label className="delete-all-control">
                            <input
                              type="checkbox"
                              checked={isDeleteAll}
                              disabled={isDeleting || isScanning}
                              onChange={(event) =>
                                setDeleteAllGroup(
                                  event.currentTarget.checked
                                    ? group.hash
                                    : null,
                                )
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span>Delete all copies</span>
                          </label>
                          <button
                            className="group-delete-button"
                            disabled={!isDeleteAll || isDeleting || isScanning}
                            onClick={() => void deleteAllCopiesInGroup(group)}
                            type="button">
                            {isDeleteAll && isDeleting
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                        {isDeleteAll && (
                          <p className="delete-all-warning">
                            Warning: all {group.files.length} copies will be
                            deleted.
                          </p>
                        )}
                        <div
                          className={`file-list ${isDeleteAllMode ? "locked-region" : ""}`}
                          inert={isDeleteAllMode}>
                          {group.files.map((file) => (
                            <div
                              className={`file-row ${previewPath === file.path ? "preview-selected" : ""}`}
                              key={file.path}
                              onClick={() =>
                                previewFileFromGroup(group.hash, file)
                              }
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  previewFileFromGroup(group.hash, file);
                                }
                              }}
                              role="button"
                              tabIndex={0}>
                              <button
                                className="reveal-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void revealInExplorer(file.path);
                                }}
                                type="button"
                                aria-label={`Reveal ${file.name} in Explorer`}
                                title="Reveal in Explorer">
                                ↗
                              </button>
                              <span className="file-path" title={file.path}>
                                {file.path}
                              </span>
                              <button
                                className={`keep-button ${keptFile === file.path ? "is-kept" : ""}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setKeptFiles((current) => ({
                                    ...current,
                                    [group.hash]: file.path,
                                  }));
                                }}
                                type="button">
                                {keptFile === file.path ? "KEEPING" : "Keep"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            <aside
              className="preview-pane locked-region"
              inert={isDeleteAllMode}>
              <div className="preview-heading">
                <p className="eyebrow">PREVIEW</p>
                {previewFile && <span>{previewFile.name}</span>}
              </div>
              {previewFile && isImageFile(previewFile) && !previewError ? (
                <button
                  className="preview-frame"
                  onClick={() => setIsPreviewOpen(true)}
                  aria-label={`Open larger preview of ${previewFile.name}`}
                  title="Click to enlarge"
                  type="button">
                  <img
                    key={previewPath}
                    src={previewSource}
                    alt={`Preview of ${previewFile.name}`}
                    onError={() => setPreviewError(true)}
                  />
                </button>
              ) : (
                <div className="preview-empty">
                  <span className="preview-icon">□</span>
                  <strong>
                    {previewFile && isImageFile(previewFile)
                      ? "Preview unavailable"
                      : "No image preview"}
                  </strong>
                  <span>Select an image file to preview it here.</span>
                </div>
              )}
            </aside>
          </div>
        )}
        {activeResultsTab === "results" && groups.length > 0 && (
          <div
            className="pagination locked-region"
            inert={isDeleteAllMode}
            aria-label="Duplicate group pages">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}>
              ← Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages}>
              Next →
            </button>
          </div>
        )}
        {activeResultsTab === "results" && (
          <div className="action-bar locked-region" inert={isDeleteAllMode}>
            <span>
              <b>{selected.length}</b> groups selected ·{" "}
              <b>{formatBytes(selectedBytes)}</b> to reclaim
            </span>
            <button
              className="delete-button"
              disabled={
                !selected.length || isDeleting || isScanning || isDeleteAllMode
              }
              onClick={() => void deleteSelectedFiles()}>
              {isDeleting ? "Checking files..." : "Delete selected copies"}{" "}
              <span>⌫</span>
            </button>
          </div>
        )}
        {activeResultsTab === "folders" && (
          <div className="action-bar">
            <span>
              <b>{selectedFolders.length}</b> folders selected
            </span>
            <button
              className="delete-button"
              disabled={!selectedFolders.length || isDeleting || isScanning}
              onClick={() => void deleteDuplicatesFromSelectedFolders()}>
              {isDeleting
                ? "Checking files..."
                : "Delete duplicates from selected folders"}
            </button>
          </div>
        )}
        {activeResultsTab === "move" && (
          <div className="action-bar">
            <span>
              <b>{moveCandidateFiles.length}</b> copies will move
            </span>
            <button
              className="delete-button move-button"
              disabled={
                !moveCandidateFiles.length ||
                !moveDestination ||
                moveDestinationInsideScannedFolder ||
                isMoving ||
                isDeleting ||
                isScanning
              }
              onClick={() => void moveSelectedDuplicates()}
              type="button">
              {isMoving ? "Moving files..." : "Move selected copies"}
              <span>→</span>
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
