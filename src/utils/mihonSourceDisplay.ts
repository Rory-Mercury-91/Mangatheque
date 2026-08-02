/**
 * Index Keiyoushi local : Set d'IDs (obsolescence) ou Map ID → nom (résolution).
 */
export type MihonKnownSources =
  | ReadonlySet<string>
  | ReadonlyMap<string, string>
  | null
  | undefined;

/**
 * @description Extrait le Set d'IDs connus (obsolescence) depuis Set ou Map.
 */
function knownSourceIdSet(
  knownSources: MihonKnownSources,
): ReadonlySet<string> | null {
  if (!knownSources) return null;
  if (knownSources instanceof Map) {
    return knownSources.size > 0 ? new Set(knownSources.keys()) : null;
  }
  return knownSources.size > 0 ? knownSources : null;
}

/**
 * @description Nom résolu depuis l'index Map (ignoré si Set seul).
 */
function nameFromKnownSources(
  sourceId: string,
  knownSources: MihonKnownSources,
): string {
  if (!sourceId || !(knownSources instanceof Map)) return "";
  return knownSources.get(sourceId)?.trim() || "";
}

/**
 * @description Indique si une source Mihon est absente du catalogue Keiyoushi local.
 * Sans index chargé : on ne marque JAMAIS obsolète (évite les faux positifs).
 * @param sourceId - Identifiant source Mihon.
 * @param sourceName - Nom résolu éventuel (ignoré pour le verdict si index présent).
 * @param knownSources - Index Keiyoushi local (Set d'IDs ou Map ID→nom).
 */
export function isObsoleteMihonSource(
  sourceId: string | null | undefined,
  sourceName: string | null | undefined,
  knownSources?: MihonKnownSources,
): boolean {
  const id = sourceId?.trim() || "";
  void sourceName;

  if (!id) {
    return false;
  }

  const knownIds = knownSourceIdSet(knownSources);
  if (!knownIds) {
    return false;
  }

  return !knownIds.has(id);
}

export interface MihonSourceDisplay {
  label: string;
  obsolete: boolean;
  /** Tooltip / title (ID brut si obsolète). */
  title: string;
}

/**
 * @description Libellé d'affichage d'une source Mihon.
 * Priorité : nom stocké → nom index Keiyoushi → ID brut.
 * @param sourceId - Identifiant source.
 * @param sourceName - Nom dénormalisé (peut être null).
 * @param knownSources - Index local (Map pour résoudre le nom, Set pour obsolescence).
 */
export function formatMihonSourceDisplay(
  sourceId: string | null | undefined,
  sourceName: string | null | undefined,
  knownSources?: MihonKnownSources,
): MihonSourceDisplay {
  const id = sourceId?.trim() || "";
  const stored = sourceName?.trim() || "";
  const fromIndex = nameFromKnownSources(id, knownSources);
  const name = stored || fromIndex;
  const obsolete = isObsoleteMihonSource(id, name, knownSources);

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
    title: id && name && name !== id ? `${name} (ID ${id})` : label,
  };
}

/**
 * @description Convertit la Map MihonSourceInfo en Map ID → nom pour l'affichage.
 */
export function toMihonSourceNameMap(
  sourceMap: ReadonlyMap<string, { sourceName: string }>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const [id, info] of sourceMap) {
    const name = info.sourceName?.trim();
    if (name) names.set(id, name);
  }
  return names;
}
