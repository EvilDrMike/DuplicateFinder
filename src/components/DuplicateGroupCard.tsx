import { formatBytes } from "../lib/format";
import { fileExtension } from "../lib/files";
import type { DuplicateFile, DuplicateGroup } from "../types";

type DuplicateGroupCardProps = {
  group: DuplicateGroup;
  position: number;
  keptFile: string | undefined;
  previewPath: string;
  isSelected: boolean;
  isDeleteAll: boolean;
  isDeleteAllMode: boolean;
  isBusy: boolean;
  isDeleting: boolean;
  onToggleSelected: () => void;
  onDeleteAllChange: (checked: boolean) => void;
  onDeleteAll: () => void;
  onKeep: (path: string) => void;
  onPreview: (file: DuplicateFile) => void;
  onReveal: (path: string) => void;
};

export function DuplicateGroupCard({
  group,
  position,
  keptFile,
  previewPath,
  isSelected,
  isDeleteAll,
  isDeleteAllMode,
  isBusy,
  isDeleting,
  onToggleSelected,
  onDeleteAllChange,
  onDeleteAll,
  onKeep,
  onPreview,
  onReveal,
}: DuplicateGroupCardProps) {
  const isLocked = isDeleteAllMode && !isDeleteAll;
  const titleFile =
    group.files.find((file) => file.path === keptFile) ?? group.files[0];
  const extension = fileExtension(titleFile.name);
  const reclaimableBytes = group.files
    .filter((file) => file.path !== titleFile.path)
    .reduce((total, file) => total + file.size, 0);
  const isNameMatch = group.hash.startsWith("name:");
  const contentVersions = isNameMatch
    ? [...new Set(group.files.map((file) => file.contentHash ?? ""))]
    : [];
  const contentsDiffer = contentVersions.length > 1;
  const versionLabel = (file: DuplicateFile) =>
    String.fromCharCode(65 + contentVersions.indexOf(file.contentHash ?? ""));

  return (
    <article
      className={`duplicate-group ${isSelected ? "selected" : ""} ${isDeleteAll ? "delete-all-selected" : ""} ${isLocked ? "locked-region" : ""}`}
      inert={isLocked}>
      <button
        className="group-toggle"
        disabled={isDeleteAllMode || !keptFile}
        title={keptFile ? undefined : "Choose a file to keep first"}
        onClick={onToggleSelected}
        aria-label={`Select group ${position}`}
        type="button">
        <span>{isSelected ? "✓" : ""}</span>
      </button>
      <div className="group-main">
        <div className="group-title">
          <span className={`file-type type-${extension}`}>
            {extension.toUpperCase()}
          </span>
          <strong>{titleFile.name}</strong>
          <span>
            {group.files.length} {contentsDiffer ? "files" : "copies"} ·{" "}
            {formatBytes(reclaimableBytes)}{" "}
          </span>
          {contentsDiffer && (
            <span
              className="match-badge differs"
              title="These files share a name but their contents are different. Deleting one may lose data.">
              ⚠ Names match · {contentVersions.length} different versions
            </span>
          )}
          <label className="delete-all-control">
            <input
              type="checkbox"
              checked={isDeleteAll}
              disabled={isBusy}
              onChange={(event) =>
                onDeleteAllChange(event.currentTarget.checked)
              }
            />
            <span>Delete all copies</span>
          </label>
          <button
            className="group-delete-button"
            disabled={!isDeleteAll || isBusy}
            onClick={onDeleteAll}
            type="button">
            {isDeleteAll && isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
        {isDeleteAll && (
          <p className="delete-all-warning">
            Warning: all {group.files.length} copies will be deleted.
          </p>
        )}
        <div
          className={`file-list ${isDeleteAllMode ? "locked-region" : ""}`}
          inert={isDeleteAllMode}>
          {group.files.map((file) => (
            <div
              className={`file-row ${isNameMatch ? "has-meta" : ""} ${previewPath === file.path ? "preview-selected" : ""}`}
              key={file.path}
              onClick={() => onPreview(file)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onPreview(file);
                }
              }}
              role="button"
              tabIndex={0}>
              <button
                className="reveal-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReveal(file.path);
                }}
                type="button"
                aria-label={`Reveal ${file.name} in Explorer`}
                title="Reveal in Explorer">
                ↗
              </button>
              <span className="file-path" title={file.path}>
                {file.path}
              </span>
              {isNameMatch && (
                <span className="file-meta">
                  {contentsDiffer && `Version ${versionLabel(file)} · `}
                  {formatBytes(file.size)}
                </span>
              )}
              <button
                className={`keep-button ${keptFile === file.path ? "is-kept" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onKeep(file.path);
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
}
