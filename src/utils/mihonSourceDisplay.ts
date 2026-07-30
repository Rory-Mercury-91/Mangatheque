/**
 * @description Indique si une source Mihon est absente du catalogue Keiyoushi local.
 * Sans index chargé : on ne marque JAMAIS obsolète (évite les faux positifs).
 * @param sourceId - Identifiant source Mihon.
 * @param sourceName - Nom résolu éventuel (ignoré pour le verdict si index présent).
 * @param knownSourceIds - Index Keiyoushi local (requis pour un verdict fiable).
 */
export function isObsoleteMihonSource(
  sourceId: string | null | undefined,
  sourceName: string | null | undefined,
  knownSourceIds?: ReadonlySet<string> | null,
): boolean {
  const id = sourceId?.trim() || "";
  void sourceName;

  if (!id) {
    return false;
  }

  // Verdict uniquement si l'index est disponible et non vide.
  if (!knownSourceIds || knownSourceIds.size === 0) {
    return false;
  }

  return !knownSourceIds.has(id);
}

export interface MihonSourceDisplay {
  label: string;
  obsolete: boolean;
  /** Tooltip / title (ID brut si obsolète). */
  title: string;
}

/**
 * @description Libellé d'affichage d'une source Mihon (obsolète → libellé dédié).
 */
export function formatMihonSourceDisplay(
  sourceId: string | null | undefined,
  sourceName: string | null | undefined,
  knownSourceIds?: ReadonlySet<string> | null,
): MihonSourceDisplay {
  const id = sourceId?.trim() || "";
  const name = sourceName?.trim() || "";
  const obsolete = isObsoleteMihonSource(id, name, knownSourceIds);

  if (obsolete) {
    return {
      label: "Source obsolète",
      obsolete: true,
      title: id
        ? `Source obsolète (ID ${id}) — absente du catalogue Keiyoushi`
        : "Source obsolète — absente du catalogue Keiyoushi",
    };
  }

  const label = name || id || "Source Mihon";
  return {
    label,
    obsolete: false,
    title: label,
  };
}
