/**
 * @description Normalise un titre pour comparaison (casse, accents, espaces).
 * @param title - Titre brut.
 */
export function normalizeTitleForComparison(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
