/**
 * @description Indique si le libellé / ID Mihon correspond à une source non résolue
 * (extension retirée du catalogue Keiyoushi, ID brut seul).
 * @param sourceId - Identifiant source Mihon.
 * @param sourceName - Nom résolu éventuel.
 * @param knownSourceIds - Index Keiyoushi local (optionnel, détection plus sûre).
 */
export function isObsoleteMihonSource(
  sourceId: string | null | undefined,
  sourceName: string | null | undefined,
  knownSourceIds?: ReadonlySet<string> | null,
): boolean {
  const id = sourceId?.trim() || "";
  const name = sourceName?.trim() || "";

  if (!id && !name) {
    return false;
  }

  if (knownSourceIds && knownSourceIds.size > 0 && id) {
    return !knownSourceIds.has(id);
  }

  if (!name) {
    return Boolean(id);
  }
  if (id && (name === id || name === `source ${id}`)) {
    return true;
  }
  // ID numérique long affiché tel quel (ex. anciennes extensions).
  if (/^\d{12,}$/.test(name)) {
    return true;
  }
  return false;
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
