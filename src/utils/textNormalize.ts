/**
 * @description Normalise un titre pour comparaison / recherche.
 * Ignore casse, accents (é→e), ponctuation et espaces multiples.
 * Ex. « Moi, quand… » ≡ « moi quand ».
 * @param title - Titre brut.
 */
export function normalizeTitleForComparison(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @description Indique si un texte (ou l'un des candidats) contient la requête, après normalisation.
 * @param haystacks - Titres / champs à tester.
 * @param query - Saisie utilisateur.
 */
export function matchesNormalizedSearch(
  haystacks: Array<string | null | undefined>,
  query: string,
): boolean {
  const needle = normalizeTitleForComparison(query);
  if (!needle) return true;
  return haystacks.some((value) => {
    if (!value?.trim()) return false;
    return normalizeTitleForComparison(value).includes(needle);
  });
}
