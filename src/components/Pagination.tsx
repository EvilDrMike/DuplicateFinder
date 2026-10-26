type PaginationProps = {
  locked: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function Pagination({
  locked,
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  return (
    <div
      className="pagination locked-region"
      inert={locked}
      aria-label="Duplicate group pages">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}>
        ← Previous
      </button>
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}>
        Next →
      </button>
    </div>
  );
}
