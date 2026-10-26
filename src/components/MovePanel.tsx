import type { MoveCandidateFile, MoveSource } from "../types";

type MovePanelProps = {
  destination: string;
  onBrowse: () => void;
  isMoving: boolean;
  isDestinationInsideScan: boolean;
  error: string | null;
  source: MoveSource;
  onSourceChange: (source: MoveSource) => void;
  fileSelectionCount: number;
  folderSelectionCount: number;
  candidates: MoveCandidateFile[];
};

export function MovePanel({
  destination,
  onBrowse,
  isMoving,
  isDestinationInsideScan,
  error,
  source,
  onSourceChange,
  fileSelectionCount,
  folderSelectionCount,
  candidates,
}: MovePanelProps) {
  return (
    <div className="move-panel" role="tabpanel">
      <div className="move-destination-row">
        <div>
          <strong>Destination folder</strong>
          <span>
            Kept files stay put; moved files keep folders below their common
            parent.
          </span>
        </div>
        <div className="move-destination-control">
          <input
            value={destination}
            placeholder="Choose a destination folder"
            aria-label="Move destination folder"
            readOnly
          />
          <button
            className="browse-button"
            onClick={onBrowse}
            disabled={isMoving}
            type="button">
            Browse
          </button>
        </div>
      </div>
      {isDestinationInsideScan ? (
        <p className="move-error" role="alert">
          Choose a destination outside every folder searched for duplicates.
        </p>
      ) : (
        error && (
          <p className="move-error" role="alert">
            {error}
          </p>
        )
      )}
      <div
        className="move-source-control"
        role="group"
        aria-label="Move selection source">
        <button
          className={source === "files" ? "active" : ""}
          onClick={() => onSourceChange("files")}
          aria-pressed={source === "files"}
          type="button">
          Files ({fileSelectionCount})
        </button>
        <button
          className={source === "folders" ? "active" : ""}
          onClick={() => onSourceChange("folders")}
          aria-pressed={source === "folders"}
          type="button">
          Folders ({folderSelectionCount})
        </button>
      </div>
      <div className="move-selection-heading">
        <strong>{candidates.length} duplicate copies selected</strong>
        <span>
          {source === "files"
            ? "Select groups in Files to choose which copies to move."
            : "Select folders in Folder. Copies outside the selection stay put; folder order chooses a copy to keep when all copies are selected."}
        </span>
      </div>
      {candidates.length ? (
        <div className="move-file-list">
          {candidates.map((file) => (
            <div className="move-file-row" key={file.path}>
              <strong>{file.name}</strong>
              <span title={file.path}>{file.path}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>
            {source === "files"
              ? "No duplicate copies selected"
              : "No duplicate copies selected from folders"}
          </strong>
          <span>
            {source === "files"
              ? "Select duplicate groups in Files to move their extra copies."
              : "Select folders in Folder to move duplicate copies from those locations."}
          </span>
        </div>
      )}
    </div>
  );
}
