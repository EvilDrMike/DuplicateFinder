import { useState } from "react";
import { filterPresets } from "../constants";
import type { MatchMode } from "../types";

type ScanPanelProps = {
  locked: boolean;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  groupCount: number;
  folders: string[];
  onAddFolder: (folder: string) => void;
  onBrowse: () => void;
  onRemoveFolder: (folder: string) => void;
  onClearFolders: () => void;
  fileExtensions: string;
  onFileExtensionsChange: (value: string) => void;
  activeFilterPresets: string[];
  onToggleFilterPreset: (preset: string) => void;
  matchMode: MatchMode;
  onMatchModeChange: (mode: MatchMode) => void;
  isScanning: boolean;
  onScan: () => void;
  status: string;
};

export function ScanPanel({
  locked,
  isCollapsed,
  onToggleCollapsed,
  groupCount,
  folders,
  onAddFolder,
  onBrowse,
  onRemoveFolder,
  onClearFolders,
  fileExtensions,
  onFileExtensionsChange,
  activeFilterPresets,
  onToggleFilterPreset,
  matchMode,
  onMatchModeChange,
  isScanning,
  onScan,
  status,
}: ScanPanelProps) {
  const [folderInput, setFolderInput] = useState("");

  function addTypedFolder() {
    const folder = folderInput.trim();
    if (!folder) return;
    onAddFolder(folder);
    setFolderInput("");
  }

  function clearFolders() {
    setFolderInput("");
    onClearFolders();
  }

  return (
    <section className="scan-panel locked-region" inert={locked}>
      <button
        className="scan-panel-header"
        onClick={onToggleCollapsed}
        aria-expanded={!isCollapsed}
        type="button">
        <span className="panel-label">
          <span className="pulse" /> SCAN LOCATIONS
        </span>
        <span className="scan-panel-toggle">
          {isCollapsed ? `${groupCount} groups found · Rescan` : "Collapse"}
          <span aria-hidden="true">{isCollapsed ? "↓" : "↑"}</span>
        </span>
      </button>
      {!isCollapsed && (
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
                Clear folders
              </button>
              <button
                className="browse-button"
                onClick={onBrowse}
                disabled={isScanning}
                type="button">
                Browse
              </button>
            </div>
          </div>
          <div className="manual-folder-inputs">
            <div className="manual-folder-row">
              <input
                value={folderInput}
                onChange={(event) => setFolderInput(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addTypedFolder();
                }}
                placeholder="Type or paste a folder path"
                aria-label="Folder path"
              />
              <button
                className="add-path-button"
                onClick={addTypedFolder}
                disabled={!folderInput.trim()}
                type="button">
                Add
              </button>
            </div>
          </div>
          <div className="folder-list-heading">
            <span>Selected folders ({folders.length})</span>
          </div>
          <div className="folder-list" aria-live="polite">
            {folders.length === 0 ? (
              <div className="folder-empty">No folders selected yet</div>
            ) : (
              folders.map((folder) => (
                <div className="folder-item" key={folder}>
                  <span className="folder-name" title={folder}>
                    {folder}
                  </span>
                  <button
                    className="remove-folder"
                    onClick={() => onRemoveFolder(folder)}
                    aria-label={`Remove ${folder}`}
                    title="Remove folder"
                    type="button">
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
                onFileExtensionsChange(event.currentTarget.value)
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
                    onClick={() => onToggleFilterPreset(preset)}
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
              {(["content", "filename"] as const).map((mode) => (
                <button
                  className={matchMode === mode ? "active" : ""}
                  key={mode}
                  onClick={() => onMatchModeChange(mode)}
                  aria-pressed={matchMode === mode}
                  type="button">
                  {mode === "content" ? "Content" : "Filename"}
                </button>
              ))}
            </div>
          </div>
          <div className="scan-action-row">
            <button
              className="scan-button"
              onClick={onScan}
              disabled={isScanning || !folders.length}
              type="button">
              {isScanning ? "Scanning..." : "Scan selected folders"}
              <span>→</span>
            </button>
          </div>
          <p className="status">{status}</p>
        </div>
      )}
    </section>
  );
}
