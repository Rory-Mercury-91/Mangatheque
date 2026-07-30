import {
  buildImportMergePreview,
  mergeImportFormValues,
  type ImportMergePreview,
} from "@/services/importMergeService";
import {
  attachWorkMihonSource,
  fetchWorkMihonSources,
} from "@/services/mihon/workMihonSourceService";
import {
  deleteWork,
  fetchWorkForEdit,
  updateWorkWithVolumes,
  workToFormValues,
} from "@/services/workService";
import type { Owner } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";

/**
 * @description Prépare l'aperçu de fusion de deux fiches déjà en bibliothèque.
 * Les données de `fromWorkId` sont absorbées dans `intoWorkId`.
 * @param intoWorkId - Fiche conservée.
 * @param fromWorkId - Fiche absorbée (sera supprimée après confirmation).
 * @param owners - Propriétaires du foyer.
 */
export async function prepareWorksMergePreview(
  intoWorkId: string,
  fromWorkId: string,
  owners: Owner[] = [],
): Promise<ImportMergePreview> {
  if (intoWorkId === fromWorkId) {
    throw new Error("Impossible de fusionner une fiche avec elle-même.");
  }

  const [intoEdit, fromEdit] = await Promise.all([
    fetchWorkForEdit(intoWorkId),
    fetchWorkForEdit(fromWorkId),
  ]);

  const existing = workToFormValues(intoEdit.work, intoEdit.volumes);
  const incoming = workToFormValues(fromEdit.work, fromEdit.volumes);

  // La fiche Nautiljon fournit le catalogue ; Mihon ne doit jamais écraser ces champs.
  const intoIsNautiljon = /nautiljon\.com/i.test(existing.sourceUrl.trim());
  const fromIsNautiljon = /nautiljon\.com/i.test(incoming.sourceUrl.trim());
  const catalogSide = fromIsNautiljon
    ? incoming
    : intoIsNautiljon
      ? existing
      : null;
  const otherSide = fromIsNautiljon
    ? existing
    : intoIsNautiljon
      ? incoming
      : null;

  const merged =
    catalogSide && otherSide
      ? mergeImportFormValues(otherSide, catalogSide)
      : mergeImportFormValues(existing, incoming);

  merged.malId = existing.malId ?? incoming.malId;
  merged.anilistId = existing.anilistId ?? incoming.anilistId;
  merged.mihonSourceId = existing.mihonSourceId || incoming.mihonSourceId;
  merged.mihonSourceName = existing.mihonSourceName || incoming.mihonSourceName;
  merged.mihonCatalogUrl = existing.mihonCatalogUrl || incoming.mihonCatalogUrl;

  if (catalogSide) {
    const catalogTitle = catalogSide.title.trim();
    if (catalogTitle) {
      merged.title = catalogTitle;
    }
    const catalogCover = catalogSide.coverUrl.trim();
    if (catalogCover) {
      merged.coverUrl = catalogCover;
    }
    const catalogSource = catalogSide.sourceUrl.trim();
    if (catalogSource) {
      merged.sourceUrl = catalogSource;
    }
  } else {
    const incomingCover = incoming.coverUrl.trim();
    const existingCover = existing.coverUrl.trim();
    merged.coverUrl =
      incomingCover && (!existingCover || /nautiljon\.com/i.test(incomingCover))
        ? incomingCover
        : existingCover || incomingCover;
  }

  return buildImportMergePreview(intoWorkId, existing, merged, owners);
}

/**
 * @description Applique la fusion : enregistre la fiche conservée, transfère les
 * sources Mihon, supprime la fiche absorbée.
 * @param intoWorkId - Fiche conservée.
 * @param fromWorkId - Fiche absorbée.
 * @param mergedValues - Valeurs déjà fusionnées (aperçu).
 * @param fromTitle - Titre de la fiche absorbée (journal).
 */
export async function commitWorksMerge(
  intoWorkId: string,
  fromWorkId: string,
  mergedValues: WorkFormValues,
  fromTitle: string,
): Promise<string> {
  if (intoWorkId === fromWorkId) {
    throw new Error("Impossible de fusionner une fiche avec elle-même.");
  }

  await updateWorkWithVolumes(intoWorkId, mergedValues);

  const sources = await fetchWorkMihonSources(fromWorkId);
  for (const source of sources) {
    await attachWorkMihonSource(intoWorkId, {
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      catalogUrl: source.catalogUrl,
    });
  }

  await deleteWork(
    fromWorkId,
    `Fusion manuelle dans la fiche conservée (absorbée : « ${fromTitle} »)`,
  );

  requestSupabaseDataReload();
  return intoWorkId;
}
