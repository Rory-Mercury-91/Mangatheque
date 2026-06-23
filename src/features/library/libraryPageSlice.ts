/**
 * @description Retourne les éléments d'une page bibliothèque (pagination locale).
 * @param items - Liste filtrée complète.
 * @param page - Numéro de page (1-based).
 * @param pageSize - Taille de page.
 */
export function getLibraryPageWorks<T>(
  items: T[],
  page: number,
  pageSize: number,
): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/**
 * @description Pages à garder montées : page courante + page suivante directe.
 * @param currentPage - Page affichée.
 * @param totalPages - Nombre total de pages.
 */
export function getLibraryBufferedPages(
  currentPage: number,
  totalPages: number,
): number[] {
  const pages = [currentPage];
  if (currentPage < totalPages) {
    pages.push(currentPage + 1);
  }
  return pages;
}
