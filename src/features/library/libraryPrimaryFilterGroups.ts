/** @description Définition des quatre groupes de filtres principaux (profil, favoris, statut, lecture). */
export const LIBRARY_PRIMARY_FILTER_GROUPS = [
  { id: "compte", label: "Profil", icon: "👤" },
  { id: "favoris", label: "Favoris", icon: "⭐" },
  { id: "statut", label: "Statut", icon: "🎬" },
  { id: "reading", label: "Lecture", icon: "📑" },
] as const;

export type LibraryPrimaryFilterGroupId =
  (typeof LIBRARY_PRIMARY_FILTER_GROUPS)[number]["id"];

/**
 * @description Retourne le libellé d'un groupe de filtres principal.
 * @param id - Identifiant du groupe.
 */
export function getLibraryPrimaryFilterGroup(
  id: LibraryPrimaryFilterGroupId,
): (typeof LIBRARY_PRIMARY_FILTER_GROUPS)[number] {
  const group = LIBRARY_PRIMARY_FILTER_GROUPS.find((item) => item.id === id);
  if (!group) {
    throw new Error(`Groupe de filtres inconnu : ${id}`);
  }
  return group;
}
