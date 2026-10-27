import { pluralize } from "../lib/format";
import type { DuplicateFolder } from "../types";

type FolderResultsProps = {
  folders: DuplicateFolder[];
  selectedFolders: string[];
  onSelectedFoldersChange: (update: (current: string[]) => string[]) => void;
  onMoveFolder: (path: string, direction: -1 | 1) => void;
  onMoveFolderToEdge: (path: string, edge: "top" | "bottom") => void;
  onRevealFolder: (path: string) => void;
  showManualOrder: boolean;
};

export function FolderResults({
  folders,
  selectedFolders,
  onSelectedFoldersChange,
  onMoveFolder,
  onMoveFolderToEdge,
  onRevealFolder,
  showManualOrder,
}: FolderResultsProps) {
  if (!folders.length) {
    return (
      <div className="folder-results" role="tabpanel">
        <div className="empty-state">
          <strong>No duplicate folders found</strong>
          <span>Folders containing duplicate files will appear here.</span>
        </div>
      </div>
    );
  }

  const allSelected = folders.every((folder) =>
    selectedFolders.includes(folder.path),
  );

  return (
    <div className="folder-results" role="tabpanel">
      {!showManualOrder && (
        <p className="folder-sort-note" role="note">
          Sorting changes display only; manual order still determines which copy
          is kept.
        </p>
      )}
      <label className="folder-select-all">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            onSelectedFoldersChange(() =>
              checked ? folders.map((folder) => folder.path) : [],
            );
          }}
          aria-label="Select all folders"
        />
        <span>Select all folders</span>
      </label>
      {folders.map((folder, index) => (
        <div className="duplicate-folder" key={folder.path}>
          <label className="folder-select-control">
            <input
              type="checkbox"
              checked={selectedFolders.includes(folder.path)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                onSelectedFoldersChange((current) =>
                  checked
                    ? [...current, folder.path]
                    : current.filter((path) => path !== folder.path),
                );
              }}
              aria-label={`Select ${folder.path}`}
            />
          </label>
          <button
            className="reveal-button"
            onClick={() => onRevealFolder(folder.path)}
            aria-label={`Reveal ${folder.path} in Explorer`}
            title="Reveal in Explorer"
            type="button">
            ↗
          </button>
          <span className="duplicate-folder-path" title={folder.path}>
            {folder.path}
          </span>
          <span className="duplicate-folder-count">
            {folder.groupCount} {pluralize(folder.groupCount, "group")} ·{" "}
            {folder.fileCount} of {folder.scannedFileCount ?? "?"} files
          </span>
          <span
            className="duplicate-folder-percentage"
            title={
              folder.scannedFileCount === null
                ? "Percentage unavailable for saved results from before per-folder scan counts were recorded"
                : `${folder.fileCount} of ${folder.scannedFileCount} scanned files are in duplicate groups`
            }>
            {folder.duplicatePercentage === null
              ? "—"
              : `${folder.duplicatePercentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`}
          </span>
          {showManualOrder && (
            <span className="folder-reorder-controls">
              <button
                type="button"
                onClick={() => onMoveFolderToEdge(folder.path, "top")}
                disabled={index === 0}
                aria-label={`Move ${folder.path} to top`}
                title="Move folder to top">
                ⇈
              </button>
              <button
                type="button"
                onClick={() => onMoveFolder(folder.path, -1)}
                disabled={index === 0}
                aria-label={`Move ${folder.path} up`}
                title="Move folder up">
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMoveFolder(folder.path, 1)}
                disabled={index === folders.length - 1}
                aria-label={`Move ${folder.path} down`}
                title="Move folder down">
                ↓
              </button>
              <button
                type="button"
                onClick={() => onMoveFolderToEdge(folder.path, "bottom")}
                disabled={index === folders.length - 1}
                aria-label={`Move ${folder.path} to bottom`}
                title="Move folder to bottom">
                ⇊
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
