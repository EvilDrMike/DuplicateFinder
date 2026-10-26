import { Dialog } from "./Modal";

type DeleteErrorDialogProps = {
  message: string;
  onClose: () => void;
};

export function DeleteErrorDialog({
  message,
  onClose,
}: DeleteErrorDialogProps) {
  return (
    <Dialog
      eyebrow="DELETE ABORTED"
      title="Scan is out of date."
      titleId="delete-error-title"
      closeLabel="Close delete warning"
      className="delete-error-dialog"
      role="alertdialog"
      onClose={onClose}>
      <p>{message}</p>
      <p className="delete-error-help">
        No files were deleted. Rescan the selected folders before trying again.
      </p>
      <button
        className="scan-button delete-error-action"
        onClick={onClose}
        type="button">
        Close warning
      </button>
    </Dialog>
  );
}
