import { formatBytes, formatDuration } from "../lib/format";

type SummaryGridProps = {
  locked: boolean;
  totalFilesScanned: number;
  totalScanTimeMs: number;
  totalSizeScanned: number;
  groupCount: number;
  duplicateCount: number;
  reclaimableBytes: number;
};

export function SummaryGrid({
  locked,
  totalFilesScanned,
  totalScanTimeMs,
  totalSizeScanned,
  groupCount,
  duplicateCount,
  reclaimableBytes,
}: SummaryGridProps) {
  const filesPerSecond =
    totalScanTimeMs > 0 ? totalFilesScanned / (totalScanTimeMs / 1000) : 0;
  const stats = [
    {
      label: "Files scanned",
      value: totalFilesScanned.toLocaleString(),
      note: "matching the current filter",
    },
    {
      label: "Total scan time",
      value: formatDuration(totalScanTimeMs),
      note: "last completed scan",
    },
    {
      label: "Files per second",
      value:
        totalScanTimeMs > 0
          ? Math.round(filesPerSecond).toLocaleString()
          : "--",
      note: "average scan rate",
    },
    {
      label: "Total scanned size",
      value: formatBytes(totalSizeScanned),
      note: "across selected folders",
    },
    {
      label: "Duplicate groups",
      value: groupCount,
      note: "clusters of identical files",
    },
    { label: "Extra copies", value: duplicateCount, note: "safe to review" },
  ];

  return (
    <section className="summary-grid locked-region" inert={locked}>
      {stats.map((stat) => (
        <div key={stat.label}>
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
          <small>{stat.note}</small>
        </div>
      ))}
      <div className="accent-stat">
        <span>Potentially reclaimable</span>
        <strong>{formatBytes(reclaimableBytes)}</strong>
        <small>excluding your originals</small>
      </div>
    </section>
  );
}
