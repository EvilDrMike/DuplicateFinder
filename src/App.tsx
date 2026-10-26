import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "./api";
import { AboutDialog } from "./components/AboutDialog";
import { DeleteErrorDialog } from "./components/DeleteErrorDialog";
import { DuplicateGroupCard } from "./components/DuplicateGroupCard";
import { FolderResults } from "./components/FolderResults";
import { MovePanel } from "./components/MovePanel";
import { Pagination } from "./components/Pagination";
import { PreviewModal } from "./components/PreviewModal";
import { PreviewPane } from "./components/PreviewPane";
import { ScanPanel } from "./components/ScanPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { SummaryGrid } from "./components/SummaryGrid";
import {
  demoGroups,
  filterPresets,
  itemsPerPageOptions,
  type FilterPreset,
} from "./constants";
import { usePersistentState } from "./hooks/usePersistentState";
import { useSettings } from "./hooks/useSettings";
import { formatBytes, pluralize } from "./lib/format";
import {
  applyFolderOrder,
  isImageFile,
  isPathInsideFolder,
  planFolderCleanup,
  selectedFolderPositions,
  summarizeDuplicateFolders,
  toFileInput,
  toMoveCandidate,
} from "./lib/files";
import {
  isStringArray,
  loadSavedGroups,
  readPositiveNumber,
  storageKeys,
  writeJson,
  writeNumber,
} from "./lib/storage";
import type {
  DeleteGroup,
  DuplicateFile,
  DuplicateGroup,
  ResultsTab,
} from "./types";
import "./App.css";
import "./styles/themes/index.css";

const resultsTabs: { id: ResultsTab; label: string; heading: string }[] = [
  { id: "results", label: "Files", heading: "Duplicate groups" },
  { id: "folders", label: "Folder", heading: "Folders with duplicates" },
  { id: "move", label: "Move", heading: "Move duplicate copies" },
];

function App() {
  const { settings, updateSettings } = useSettings();
  const {
    theme,
    motion,
    matchMode,
    itemsPerPage,
    fileExtensions,
    filterPresets: activeFilterPresets,
    moveDestination,
    moveSource,
    folderOrder,
  } = settings;

  const [folders, setFolders] = usePersistentState(
    storageKeys.folders,
    () => [],
    isStringArray,
  );
  const [scannedFolders, setScannedFolders] = usePersistentState(
    storageKeys.scannedFolders,
    () => folders,
    isStringArray,
  );

  const [savedGroups] = useState(loadSavedGroups);
  const [groups, setGroups] = useState<DuplicateGroup[]>(
    () => savedGroups ?? demoGroups,
  );
  const [hasSavedScanResults, setHasSavedScanResults] = useState(
    savedGroups !== null,
  );
  const [totalFilesScanned, setTotalFilesScanned] = useState(() =>
    readPositiveNumber(storageKeys.totalFiles),
  );
  const [totalSizeScanned, setTotalSizeScanned] = useState(() =>
    readPositiveNumber(storageKeys.totalSize),
  );
  const [totalScanTimeMs, setTotalScanTimeMs] = useState(() =>
    readPositiveNumber(storageKeys.scanTimeMs),
  );

  const [requestedPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [deleteAllGroup, setDeleteAllGroup] = useState<string | null>(null);
  const [keptFiles, setKeptFiles] = useState<Record<string, string>>({});
  const [selectedPreviewPath, setPreviewPath] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isScanLocationsCollapsed, setIsScanLocationsCollapsed] = useState(
    Boolean(savedGroups?.length),
  );
  const [activeResultsTab, setActiveResultsTab] =
    useState<ResultsTab>("results");
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [status, setStatus] = useState("Demo results loaded");

  const isDeleteAllMode = deleteAllGroup !== null;
  const isBusy = isDeleting || isScanning;

  const duplicateCount = groups.reduce(
    (count, group) => count + group.files.length - 1,
    0,
  );
  const reclaimable = groups.reduce(
    (total, group) =>
      total +
      group.files
        .filter(
          (file) =>
            deleteAllGroup === group.hash ||
            file.path !== (keptFiles[group.hash] ?? group.files[0].path),
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
              .filter((file) => file.path !== keptFiles[group.hash])
              .reduce((sum, file) => sum + file.size, 0),
          0,
        ),
    [groups, selected, keptFiles],
  );
  const totalPages = Math.max(1, Math.ceil(groups.length / itemsPerPage));
  const currentPage = Math.min(requestedPage, totalPages);
  const visibleGroups = groups.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const orderedFolders = useMemo(
    () => applyFolderOrder(summarizeDuplicateFolders(groups), folderOrder),
    [groups, folderOrder],
  );
  const folderPositions = useMemo(
    () => selectedFolderPositions(orderedFolders, selectedFolders),
    [orderedFolders, selectedFolders],
  );

  const selectedMoveFiles = groups
    .filter((group) => selected.includes(group.hash) && keptFiles[group.hash])
    .flatMap((group) =>
      group.files
        .filter((file) => file.path !== keptFiles[group.hash])
        .map((file) => toMoveCandidate(file, group)),
    );
  const selectedFolderMoveFiles = groups.flatMap(
    (group) =>
      planFolderCleanup(group, folderPositions)?.removable.map((file) =>
        toMoveCandidate(file, group),
      ) ?? [],
  );
  const moveCandidateFiles =
    moveSource === "files" ? selectedMoveFiles : selectedFolderMoveFiles;
  const moveDestinationInsideScannedFolder = scannedFolders.some((folder) =>
    isPathInsideFolder(moveDestination, folder),
  );

  const previewPath = selectedPreviewPath || groups[0]?.files[0]?.path || "";
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
  const previewSource = previewPath.startsWith("/test-images/")
    ? previewPath
    : convertFileSrc(previewPath);

  useEffect(() => {
    if (!hasSavedScanResults) return;
    writeJson(storageKeys.groups, groups);
  }, [groups, hasSavedScanResults]);

  useEffect(() => {
    if (!hasSavedScanResults) return;
    writeNumber(storageKeys.totalFiles, totalFilesScanned);
    writeNumber(storageKeys.totalSize, totalSizeScanned);
    writeNumber(storageKeys.scanTimeMs, totalScanTimeMs);
  }, [
    hasSavedScanResults,
    totalFilesScanned,
    totalSizeScanned,
    totalScanTimeMs,
  ]);

  function showPreview(file: DuplicateFile) {
    setPreviewPath(file.path);
    setPreviewError(false);
  }

  function clearPreviewIfDeleted(deletedPaths: Set<string>) {
    if (deletedPaths.has(previewPath)) {
      setPreviewPath("");
      setPreviewError(false);
    }
  }

  function cyclePreview(direction: -1 | 1) {
    const nextImage = previewGroupImages[previewImageIndex + direction];
    if (previewImageIndex >= 0 && nextImage) showPreview(nextImage);
  }

  async function revealInExplorer(filePath: string) {
    try {
      await revealItemInDir(filePath);
    } catch {
      setStatus("Explorer reveal is available in the desktop app.");
    }
  }

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
      if (typeof chosen === "string") {
        updateSettings({ moveDestination: chosen });
      }
    } catch {
      setMoveError(
        "Choosing a destination folder is available in the desktop app.",
      );
    }
  }

  function addFolder(folder: string) {
    setFolders((current) =>
      current.includes(folder) ? current : [...current, folder],
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

  function toggleFilterPreset(preset: string) {
    updateSettings((current) => ({
      filterPresets: current.filterPresets.includes(preset)
        ? current.filterPresets.filter((item) => item !== preset)
        : [...current.filterPresets, preset],
    }));
  }

  function scanExtensions() {
    const customExtensions = fileExtensions
      .split(",")
      .map((extension) => extension.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);
    const presetExtensions = activeFilterPresets.flatMap(
      (preset) => filterPresets[preset as FilterPreset],
    );
    return [...new Set([...customExtensions, ...presetExtensions])];
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
      const result = await api.scanDirectory(
        folders,
        scanExtensions(),
        matchMode === "filename",
      );
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
    } catch (error) {
      setStatus(`Scan failed · ${String(error)} · previous results kept`);
      setIsScanLocationsCollapsed(false);
    } finally {
      setIsScanning(false);
    }
  }

  /** Runs a delete request, reporting failures in the delete error dialog. */
  async function runDelete(
    groupsToDelete: DeleteGroup[],
    onDeleted: (deletedCount: number) => void,
  ) {
    if (!groupsToDelete.length) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      onDeleted(await api.deleteDuplicateFiles(groupsToDelete));
    } catch (error) {
      setDeleteError(String(error));
      setStatus("Delete aborted");
    } finally {
      setIsDeleting(false);
    }
  }

  async function deleteSelectedFiles() {
    const groupsToDelete = groups
      .filter((group) => selected.includes(group.hash) && keptFiles[group.hash])
      .map((group): DeleteGroup => {
        const keptFile =
          group.files.find((file) => file.path === keptFiles[group.hash]) ??
          group.files[0];
        return {
          files: group.files.map((file) => toFileInput(file, group)),
          keptFile: toFileInput(keptFile, group),
          deleteAll: false,
        };
      });
    await runDelete(groupsToDelete, (deletedCount) => {
      setGroups((current) =>
        current.filter((group) => !selected.includes(group.hash)),
      );
      setSelected([]);
      setKeptFiles({});
      setStatus(
        `${deletedCount} duplicate ${pluralize(deletedCount, "file")} deleted`,
      );
    });
  }

  async function deleteAllCopiesInGroup(group: DuplicateGroup) {
    await runDelete(
      [
        {
          files: group.files.map((file) => toFileInput(file, group)),
          keptFile: toFileInput(group.files[0], group),
          deleteAll: true,
        },
      ],
      (deletedCount) => {
        setGroups((current) =>
          current.filter((item) => item.hash !== group.hash),
        );
        setSelected((current) => current.filter((hash) => hash !== group.hash));
        setKeptFiles(({ [group.hash]: _removed, ...rest }) => rest);
        clearPreviewIfDeleted(new Set(group.files.map((file) => file.path)));
        setStatus(
          `${deletedCount} ${pluralize(deletedCount, "file")} deleted (all copies)`,
        );
      },
    );
    setDeleteAllGroup(null);
  }

  async function deleteDuplicatesFromSelectedFolders() {
    const groupsToDelete = groups.flatMap((group): DeleteGroup[] => {
      const plan = planFolderCleanup(group, folderPositions);
      if (!plan?.removable.length) return [];
      return [
        {
          // Delete from the lowest-priority folder first.
          files: [...plan.removable]
            .reverse()
            .map((file) => toFileInput(file, group)),
          keptFile: toFileInput(plan.keptFile, group),
          deleteAll: false,
        },
      ];
    });
    await runDelete(groupsToDelete, (deletedCount) => {
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
      clearPreviewIfDeleted(deletedPaths);
      setStatus(
        `${deletedCount} duplicate ${pluralize(deletedCount, "file")} deleted from selected folders`,
      );
    });
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
      const movedFiles = await api.moveDuplicateFiles(
        moveCandidateFiles.map(({ path, expectedHash }) => ({
          path,
          expectedHash,
        })),
        moveDestination,
        scannedFolders,
      );
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
        `${movedFiles.length} duplicate ${pluralize(movedFiles.length, "copy", "copies")} moved`,
      );
    } catch (error) {
      setMoveError(String(error));
      setStatus("Move aborted");
    } finally {
      setIsMoving(false);
    }
  }

  function moveFolder(path: string, direction: -1 | 1) {
    const paths = orderedFolders.map((folder) => folder.path);
    const currentIndex = paths.indexOf(path);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= paths.length) {
      return;
    }
    [paths[currentIndex], paths[targetIndex]] = [
      paths[targetIndex],
      paths[currentIndex],
    ];
    updateSettings({ folderOrder: paths });
  }

  function keepFile(group: DuplicateGroup, path: string) {
    setKeptFiles((current) => ({ ...current, [group.hash]: path }));
    setSelected((current) =>
      current.includes(group.hash) ? current : [...current, group.hash],
    );
  }

  function toggleGroupSelected(hash: string) {
    setSelected((current) =>
      current.includes(hash)
        ? current.filter((item) => item !== hash)
        : [...current, hash],
    );
  }

  const activeTab =
    resultsTabs.find((tab) => tab.id === activeResultsTab) ?? resultsTabs[0];

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
        <SettingsDialog
          theme={theme}
          motion={motion}
          onThemeChange={(value) => updateSettings({ theme: value })}
          onMotionChange={(value) => updateSettings({ motion: value })}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {isAboutOpen && (
        <AboutDialog
          version={__APP_VERSION__}
          onClose={() => setIsAboutOpen(false)}
        />
      )}
      {isPreviewOpen && previewFile && isImageFile(previewFile) && (
        <PreviewModal
          file={previewFile}
          source={previewSource}
          groupImages={previewGroupImages}
          imageIndex={previewImageIndex}
          onNavigate={cyclePreview}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
      {deleteError && (
        <DeleteErrorDialog
          message={deleteError}
          onClose={() => setDeleteError(null)}
        />
      )}

      <ScanPanel
        locked={isDeleteAllMode}
        isCollapsed={isScanLocationsCollapsed}
        onToggleCollapsed={() =>
          setIsScanLocationsCollapsed((collapsed) => !collapsed)
        }
        groupCount={groups.length}
        folders={folders}
        onAddFolder={addFolder}
        onBrowse={() => void chooseFolders()}
        onRemoveFolder={removeFolder}
        onClearAll={clearFolders}
        fileExtensions={fileExtensions}
        onFileExtensionsChange={(value) =>
          updateSettings({ fileExtensions: value })
        }
        activeFilterPresets={activeFilterPresets}
        onToggleFilterPreset={toggleFilterPreset}
        matchMode={matchMode}
        onMatchModeChange={(value) => updateSettings({ matchMode: value })}
        isScanning={isScanning}
        onScan={() => void scan()}
        status={status}
      />

      <SummaryGrid
        locked={isDeleteAllMode}
        totalFilesScanned={totalFilesScanned}
        totalScanTimeMs={totalScanTimeMs}
        totalSizeScanned={totalSizeScanned}
        groupCount={groups.length}
        duplicateCount={duplicateCount}
        reclaimableBytes={reclaimable}
      />

      <section className="results-section">
        <div
          className="results-tabs locked-region"
          inert={isDeleteAllMode}
          role="tablist"
          aria-label="Duplicate results views">
          {resultsTabs.map((tab) => (
            <button
              className={activeResultsTab === tab.id ? "active" : ""}
              key={tab.id}
              onClick={() => setActiveResultsTab(tab.id)}
              role="tab"
              aria-selected={activeResultsTab === tab.id}
              type="button">
              {tab.label}
            </button>
          ))}
        </div>
        <div className="section-heading locked-region" inert={isDeleteAllMode}>
          <div>
            <p className="eyebrow">REVIEW RESULTS</p>
            <h2>{activeTab.heading}</h2>
          </div>
          {activeResultsTab === "results" && (
            <div className="results-settings">
              <label htmlFor="items-per-page">Items per page</label>
              <select
                id="items-per-page"
                value={itemsPerPage}
                onChange={(event) => {
                  updateSettings({
                    itemsPerPage: Number(event.currentTarget.value),
                  });
                  setCurrentPage(1);
                }}>
                {itemsPerPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="sort">Largest first&nbsp; ↓</span>
            </div>
          )}
        </div>

        {activeResultsTab === "move" && (
          <MovePanel
            destination={moveDestination}
            onBrowse={() => void chooseMoveDestination()}
            isMoving={isMoving}
            isDestinationInsideScan={moveDestinationInsideScannedFolder}
            error={moveError}
            source={moveSource}
            onSourceChange={(value) => updateSettings({ moveSource: value })}
            fileSelectionCount={selectedMoveFiles.length}
            folderSelectionCount={selectedFolderMoveFiles.length}
            candidates={moveCandidateFiles}
          />
        )}
        {activeResultsTab === "folders" && (
          <FolderResults
            folders={orderedFolders}
            selectedFolders={selectedFolders}
            onSelectedFoldersChange={setSelectedFolders}
            onMoveFolder={moveFolder}
          />
        )}
        {activeResultsTab === "results" && (
          <div className="results-grid" role="tabpanel">
            <div className="group-list">
              {groups.length === 0 ? (
                <div className="empty-state">
                  <strong>No duplicates found</strong>
                  <span>This folder is already wonderfully tidy.</span>
                </div>
              ) : (
                visibleGroups.map((group, index) => (
                  <DuplicateGroupCard
                    key={group.hash}
                    group={group}
                    position={(currentPage - 1) * itemsPerPage + index + 1}
                    keptFile={keptFiles[group.hash]}
                    previewPath={previewPath}
                    isSelected={selected.includes(group.hash)}
                    isDeleteAll={deleteAllGroup === group.hash}
                    isDeleteAllMode={isDeleteAllMode}
                    isBusy={isBusy}
                    isDeleting={isDeleting}
                    onToggleSelected={() => toggleGroupSelected(group.hash)}
                    onDeleteAllChange={(checked) =>
                      setDeleteAllGroup(checked ? group.hash : null)
                    }
                    onDeleteAll={() => void deleteAllCopiesInGroup(group)}
                    onKeep={(path) => keepFile(group, path)}
                    onPreview={showPreview}
                    onReveal={(path) => void revealInExplorer(path)}
                  />
                ))
              )}
            </div>
            <PreviewPane
              locked={isDeleteAllMode}
              file={previewFile}
              source={previewSource}
              hasError={previewError}
              onError={() => setPreviewError(true)}
              onOpen={() => setIsPreviewOpen(true)}
            />
          </div>
        )}

        {activeResultsTab === "results" && groups.length > 0 && (
          <Pagination
            locked={isDeleteAllMode}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
        {activeResultsTab === "results" && (
          <div className="action-bar locked-region" inert={isDeleteAllMode}>
            <span>
              <b>{selected.length}</b> groups selected ·{" "}
              <b>{formatBytes(selectedBytes)}</b> to reclaim
            </span>
            <button
              className="delete-button"
              disabled={!selected.length || isBusy || isDeleteAllMode}
              onClick={() => void deleteSelectedFiles()}
              type="button">
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
              disabled={!selectedFolders.length || isBusy}
              onClick={() => void deleteDuplicatesFromSelectedFolders()}
              type="button">
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
                isBusy
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
