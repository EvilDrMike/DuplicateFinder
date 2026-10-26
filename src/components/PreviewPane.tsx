import { isImageFile } from "../lib/files";
import type { DuplicateFile } from "../types";

type PreviewPaneProps = {
  locked: boolean;
  file: DuplicateFile | undefined;
  source: string;
  hasError: boolean;
  onError: () => void;
  onOpen: () => void;
};

export function PreviewPane({
  locked,
  file,
  source,
  hasError,
  onError,
  onOpen,
}: PreviewPaneProps) {
  const isImage = Boolean(file && isImageFile(file));
  return (
    <aside className="preview-pane locked-region" inert={locked}>
      <div className="preview-heading">
        <p className="eyebrow">PREVIEW</p>
        {file && <span>{file.name}</span>}
      </div>
      {file && isImage && !hasError ? (
        <button
          className="preview-frame"
          onClick={onOpen}
          aria-label={`Open larger preview of ${file.name}`}
          title="Click to enlarge"
          type="button">
          <img
            key={file.path}
            src={source}
            alt={`Preview of ${file.name}`}
            onError={onError}
          />
        </button>
      ) : (
        <div className="preview-empty">
          <span className="preview-icon">□</span>
          <strong>
            {isImage ? "Preview unavailable" : "No image preview"}
          </strong>
          <span>Select an image file to preview it here.</span>
        </div>
      )}
    </aside>
  );
}
