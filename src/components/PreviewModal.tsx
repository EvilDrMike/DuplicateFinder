import { useState } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import type { DuplicateFile } from "../types";
import { Modal } from "./Modal";

type PreviewModalProps = {
  file: DuplicateFile;
  source: string;
  groupImages: DuplicateFile[];
  imageIndex: number;
  onNavigate: (direction: -1 | 1) => void;
  onClose: () => void;
};

export function PreviewModal({
  file,
  source,
  groupImages,
  imageIndex,
  onNavigate,
  onClose,
}: PreviewModalProps) {
  const [aspectRatio, setAspectRatio] = useState(1);
  useKeyboardShortcuts({
    ArrowLeft: () => onNavigate(-1),
    ArrowRight: () => onNavigate(1),
  });

  return (
    <Modal onClose={onClose} className="preview-modal-backdrop">
      <figure
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${file.name}`}>
        <img
          src={source}
          alt={`Preview of ${file.name}`}
          style={{
            aspectRatio,
            width: `min(90vw, calc(90vh * ${aspectRatio}))`,
          }}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) {
              setAspectRatio(naturalWidth / naturalHeight);
            }
          }}
        />
        <button
          className="preview-modal-close"
          onClick={onClose}
          aria-label="Close preview"
          autoFocus
          type="button">
          ×
        </button>
        {groupImages.length > 1 && (
          <>
            <button
              className="preview-modal-nav prev"
              onClick={() => onNavigate(-1)}
              disabled={imageIndex <= 0}
              aria-label="Previous image in group"
              type="button">
              ‹
            </button>
            <button
              className="preview-modal-nav next"
              onClick={() => onNavigate(1)}
              disabled={imageIndex >= groupImages.length - 1}
              aria-label="Next image in group"
              type="button">
              ›
            </button>
            <figcaption className="preview-modal-caption">
              {imageIndex + 1} / {groupImages.length} ·{" "}
              <span title={file.path}>{file.path}</span>
            </figcaption>
          </>
        )}
      </figure>
    </Modal>
  );
}
