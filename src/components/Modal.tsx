import type { ReactNode } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

type ModalProps = {
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

/** Backdrop that closes on Escape or on a click outside its content. */
export function Modal({ onClose, className = "", children }: ModalProps) {
  useKeyboardShortcuts({ Escape: onClose });
  return (
    <div
      className={`about-backdrop ${className}`.trim()}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
      {children}
    </div>
  );
}

type DialogProps = {
  eyebrow: string;
  title: ReactNode;
  titleId: string;
  closeLabel: string;
  onClose: () => void;
  className?: string;
  role?: "dialog" | "alertdialog";
  children: ReactNode;
};

export function Dialog({
  eyebrow,
  title,
  titleId,
  closeLabel,
  onClose,
  className = "",
  role = "dialog",
  children,
}: DialogProps) {
  return (
    <Modal onClose={onClose}>
      <section
        className={`about-dialog ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}>
        <div className="about-dialog-heading">
          <p className="eyebrow">{eyebrow}</p>
          <button
            className="about-close"
            onClick={onClose}
            aria-label={closeLabel}
            type="button">
            ×
          </button>
        </div>
        <h2 id={titleId}>{title}</h2>
        {children}
      </section>
    </Modal>
  );
}
