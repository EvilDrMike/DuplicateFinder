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

type DeleteGroup = {
  files: string[];
  keptFile: string;
  deleteAll: boolean;
};

type ResultsTab = "results" | "folders";

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

function loadItemsPerPage() {
  const savedValue = Number(
    window.localStorage.getItem("duplicate-finder.items-per-page"),
  );
  return [10, 20, 50].includes(savedValue) ? savedValue : 10;
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
  const [fileExtensions, setFileExtensions] = useState("");
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
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteAllGroups, setDeleteAllGroups] = useState<string[]>([]);
  const [keptFiles, setKeptFiles] = useState<Record<string, string>>({});
  const [previewPath, setPreviewPath] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isScanLocationsCollapsed, setIsScanLocationsCollapsed] = useState(() =>
    Boolean(loadSavedGroups()?.length),
  );
  const [activeResultsTab, setActiveResultsTab] =
    useState<ResultsTab>("results");
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [status, setStatus] = useState("Demo results loaded");
  const appVersion = __APP_VERSION__;

  const duplicateCount = groups.reduce(
    (count, group) => count + group.files.length - 1,
    0,
  );
  const reclaimable = groups.reduce(
    (total, group) =>
      total +
      group.files
        .filter((file) =>
          deleteAllGroups.includes(group.hash)
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
    [groups, selected, deleteAllGroups, keptFiles],
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
  }, [hasSavedScanResults, totalFilesScanned, totalSizeScanned]);

  useEffect(() => {
    window.localStorage.setItem(
      "duplicate-finder.items-per-page",
      String(itemsPerPage),
    );
  }, [itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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
    setFolderInputs([""]);
    setGroups([]);
    setHasSavedScanResults(true);
    setTotalFilesScanned(0);
    setTotalSizeScanned(0);
    setSelected([]);
    setSelectedFolders([]);
    setDeleteAllGroups([]);
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
    try {
      const result = await invoke<ScanResult>("scan_directory", {
        paths: folders,
        extensions: normalizedExtensions(),
      });
      setGroups(result.groups);
      setHasSavedScanResults(true);
      setTotalFilesScanned(result.totalFiles);
      setTotalSizeScanned(result.totalSize);
      setSelected([]);
      setSelectedFolders([]);
      setDeleteAllGroups([]);
      setKeptFiles({});
      setPreviewPath(result.groups[0]?.files[0]?.path ?? "");
      setPreviewError(false);
      setStatus(
        `Scan complete · ${result.groups.length} duplicate groups found`,
      );
      setIsScanLocationsCollapsed(result.groups.length > 0);
      setCurrentPage(1);
    } catch {
      setGroups(demoGroups);
      setTotalFilesScanned(0);
      setTotalSizeScanned(0);
      setSelected([]);
      setSelectedFolders([]);
      setDeleteAllGroups([]);
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
      .map((group) => ({
        files: group.files.map((file) => file.path),
        keptFile: keptFiles[group.hash] ?? group.files[0].path,
        deleteAll: deleteAllGroups.includes(group.hash),
      }));
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
      setDeleteAllGroups([]);
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
          .reverse()
          .map((file) => file.path);
        if (!filesToDelete.length) return null;
        return {
          files: filesToDelete,
          keptFile,
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
        groupsToDelete.flatMap((group) => group.files),
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
      setDeleteAllGroups([]);
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
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DF</span>
          <span>DuplicateFinder</span>
        </div>
        <div className="topbar-actions">
          <button
            className="about-button"
            onClick={() => setIsAboutOpen(true)}
            type="button">
            About
          </button>
        </div>
      </header>

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
              DuplicateFinder compares file size and content hash locally. Your
              files stay on this device.
            </span>
            <div className="about-version">Version {appVersion}</div>
          </section>
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

      <section className="scan-panel">
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

      <section className="summary-grid">
        <div>
          <span>Files scanned</span>
          <strong>{totalFilesScanned.toLocaleString()}</strong>
          <small>matching the current filter</small>
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
          className="results-tabs"
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
        </div>
        <div className="section-heading">
          <div>
            <p className="eyebrow">REVIEW RESULTS</p>
            <h2>
              {activeResultsTab === "results"
                ? "Duplicate groups"
                : "Folders with duplicates"}
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
        {activeResultsTab === "folders" ? (
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
                  const isDeleteAll = deleteAllGroups.includes(group.hash);
                  const keptFile = keptFiles[group.hash] ?? group.files[0].path;
                  const keptFileDetails =
                    group.files.find((file) => file.path === keptFile) ??
                    group.files[0];
                  const groupSize = group.files
                    .filter((file) => file.path !== keptFile)
                    .reduce((total, file) => total + file.size, 0);
                  return (
                    <article
                      className={`duplicate-group ${isSelected ? "selected" : ""} ${isDeleteAll ? "delete-all-selected" : ""}`}
                      key={group.hash}>
                      <button
                        className="group-toggle"
                        onClick={() => {
                          if (isSelected) {
                            setDeleteAllGroups((current) =>
                              current.filter((hash) => hash !== group.hash),
                            );
                          }
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
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setDeleteAllGroups((current) =>
                                  checked
                                    ? [...current, group.hash]
                                    : current.filter(
                                        (hash) => hash !== group.hash,
                                      ),
                                );
                                setSelected((current) =>
                                  checked
                                    ? current.includes(group.hash)
                                      ? current
                                      : [...current, group.hash]
                                    : current.filter(
                                        (hash) => hash !== group.hash,
                                      ),
                                );
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span>Delete all copies</span>
                          </label>
                        </div>
                        {isDeleteAll && (
                          <p className="delete-all-warning">
                            Warning: all {group.files.length} copies will be
                            deleted.
                          </p>
                        )}
                        <div className="file-list">
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
            <aside className="preview-pane">
              <div className="preview-heading">
                <p className="eyebrow">PREVIEW</p>
                {previewFile && <span>{previewFile.name}</span>}
              </div>
              {previewFile && isImageFile(previewFile) && !previewError ? (
                <div className="preview-frame">
                  <img
                    key={previewPath}
                    src={previewSource}
                    alt={`Preview of ${previewFile.name}`}
                    onError={() => setPreviewError(true)}
                  />
                </div>
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
          <div className="pagination" aria-label="Duplicate group pages">
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
          <div className="action-bar">
            <span>
              <b>{selected.length}</b> groups selected ·{" "}
              <b>{formatBytes(selectedBytes)}</b> to reclaim
            </span>
            <button
              className="delete-button"
              disabled={!selected.length || isDeleting || isScanning}
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
      </section>
    </main>
  );
}

export default App;
