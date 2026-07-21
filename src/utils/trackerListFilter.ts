import { normalizeTitleForComparison } from "@/utils/textNormalize";
import type { TrackerMangaListEntry } from "@/types/tracker";

/**
 * @description Filtre une liste tracker par requête (titres + synonymes).
 * Si aucun match, renvoie la liste complète pour sélection manuelle.
 * @param entries - Entrées de la liste personnelle.
 * @param query - Texte saisi (peut être vide → liste complète).
 * @returns Résultats à afficher + indicateur « repli liste complète ».
 */
export function filterTrackerMangaList(
  entries: TrackerMangaListEntry[],
  query: string,
): { items: TrackerMangaListEntry[]; showingFullListFallback: boolean } {
  const needle = normalizeTitleForComparison(query);
  if (!needle) {
    return { items: entries, showingFullListFallback: false };
  }

  const matched = entries.filter((entry) =>
    entry.searchTitles.some((title) =>
      normalizeTitleForComparison(title).includes(needle),
    ),
  );

  if (matched.length === 0) {
    return { items: entries, showingFullListFallback: true };
  }

  return { items: matched, showingFullListFallback: false };
}
