import { Dialog } from "./Modal";

type AboutDialogProps = {
  version: string;
  onClose: () => void;
};

export function AboutDialog({ version, onClose }: AboutDialogProps) {
  return (
    <Dialog
      eyebrow="ABOUT DUPLICATEFINDER"
      title={
        <>
          Find the files
          <br />
          <em>you can let go of.</em>
        </>
      }
      titleId="about-title"
      closeLabel="Close About dialog"
      onClose={onClose}>
      <p>
        Scan a folder, review what is truly duplicated, and reclaim space with
        confidence.
      </p>
      <span className="about-note">
        DuplicateFinder matches by filename or file content locally. Your files
        stay on this device.
      </span>
      <div className="about-version">Version {version}</div>
    </Dialog>
  );
}
