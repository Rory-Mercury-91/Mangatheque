import "./LibraryPagination.css";

export interface LibraryPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * @description Contrôles de pagination compacts : << < Page X/Y >> >
 */
export function LibraryPagination({
  currentPage,
  totalPages,
  onPageChange,
}: LibraryPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="library-pagination" aria-label="Pagination">
      <button
        type="button"
        className="library-pagination-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(1)}
        aria-label="Première page"
      >
        {"<<"}
      </button>
      <button
        type="button"
        className="library-pagination-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="Page précédente"
      >
        {"<"}
      </button>
      <span className="library-pagination-status">
        Page {currentPage}/{totalPages}
      </span>
      <button
        type="button"
        className="library-pagination-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="Page suivante"
      >
        {">"}
      </button>
      <button
        type="button"
        className="library-pagination-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(totalPages)}
        aria-label="Dernière page"
      >
        {">>"}
      </button>
    </nav>
  );
}
