import { pluralize } from "../lib/format";
import type { DuplicateFolder } from "../types";

type FolderResultsProps = {
  folders: DuplicateFolder[];
  selectedFolders: string[];
  onSelectedFoldersChange: (update: (current: string[]) => string[]) => void;
  onMoveFolder: (path: string, direction: -1 | 1) => void;
};

export function FolderResults({
  folders,
  selectedFolders,
  onSelectedFoldersChange,
  onMoveFolder,
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
          <span className="folder-symbol">/</span>
          <span className="duplicate-folder-path" title={folder.path}>
            {folder.path}
          </span>
          <span className="duplicate-folder-count">
            {folder.groupCount} {pluralize(folder.groupCount, "group")} ·{" "}
            {folder.fileCount} files
          </span>
          <span className="folder-reorder-controls">
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
          </span>
        </div>
      ))}
    </div>
  );
}
