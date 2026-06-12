import { ChevronLeft, ChevronRight } from "lucide-react";
import "./LibraryPagination.css";

export interface LibraryPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * @description Contrôles de pagination pour la grille bibliothèque.
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
    <nav
      className="library-pagination"
      aria-label="Pagination bibliothèque"
    >
      <button
        type="button"
        className="library-pagination-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="Page précédente"
      >
        <ChevronLeft size={18} aria-hidden />
        Précédent
      </button>
      <span className="library-pagination-status">
        Page {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        className="library-pagination-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="Page suivante"
      >
        Suivant
        <ChevronRight size={18} aria-hidden />
      </button>
    </nav>
  );
}
