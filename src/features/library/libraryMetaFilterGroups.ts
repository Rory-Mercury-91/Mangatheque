/** @description Définition des groupes de filtres secondaires (démographie, genres). */
export const LIBRARY_META_FILTER_GROUPS = [
  { id: "demo", label: "Démographie", icon: "👥" },
  { id: "tags", label: "Genres", icon: "🏷️" },
] as const;

export type LibraryMetaFilterGroupId =
  (typeof LIBRARY_META_FILTER_GROUPS)[number]["id"];

/**
 * @description Retourne la définition d'un groupe de filtres secondaire.
 * @param id - Identifiant du groupe.
 */
export function getLibraryMetaFilterGroup(
  id: LibraryMetaFilterGroupId,
): (typeof LIBRARY_META_FILTER_GROUPS)[number] {
  const group = LIBRARY_META_FILTER_GROUPS.find((item) => item.id === id);
  if (!group) {
    throw new Error(`Groupe de filtres secondaire inconnu : ${id}`);
  }
  return group;
}
