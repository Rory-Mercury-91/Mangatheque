import { parseScrapePayloadJsonList } from "@/services/importJsonService";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import { mergeImportFormValues } from "@/services/importMergeService";
import { fillMissingTrackerIds } from "@/services/tracker/trackerIdResolveService";
import {
  fetchWorkForEdit,
  updateWorkWithVolumes,
  workToFormValues,
} from "@/services/workService";
import type { Owner } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";

/**
 * @description Fusionne plusieurs payloads scrape (export dual) en un formulaire.
 */
function scrapePayloadsToMergedForm(
  rawJson: string,
  owners: Owner[],
): WorkFormValues {
  const payloads = parseScrapePayloadJsonList(rawJson);
  let form = scrapePayloadToFormValues(payloads[0]!, owners);
  for (let index = 1; index < payloads.length; index += 1) {
    form = mergeImportFormValues(
      form,
      scrapePayloadToFormValues(payloads[index]!, owners),
    );
  }
  return form;
}

/**
 * @description Enrichit une fiche pending_mihon avec un export JSON Nautiljon.
 * Conserve Mihon + MAL/AniList locaux ; complète les IDs manquants ; sort du sas
 * si l'URL source est Nautiljon (via updateWorkWithVolumes).
 */
export async function enrichPendingMihonFromScrapeJson(
  workId: string,
  rawJson: string,
  owners: Owner[] = [],
): Promise<{ title: string; clearedFromSas: boolean }> {
  const { work, volumes } = await fetchWorkForEdit(workId);
  const existing = workToFormValues(work, volumes);
  const incoming = scrapePayloadsToMergedForm(rawJson, owners);

  const merged = mergeImportFormValues(existing, incoming);

  // Préserve explicitement les données Mihon / trackers déjà présents.
  merged.mihonSourceId = existing.mihonSourceId;
  merged.mihonSourceName = existing.mihonSourceName;
  merged.mihonCatalogUrl = existing.mihonCatalogUrl;
  merged.enrichmentStatus = existing.enrichmentStatus;
  merged.malId = existing.malId ?? merged.malId;
  merged.anilistId = existing.anilistId ?? merged.anilistId;

  const filled = await fillMissingTrackerIds({
    malId: merged.malId,
    anilistId: merged.anilistId,
  });
  merged.malId = filled.malId;
  merged.anilistId = filled.anilistId;

  await updateWorkWithVolumes(workId, merged);

  const { work: after } = await fetchWorkForEdit(workId);
  return {
    title: after.title,
    clearedFromSas: after.enrichment_status == null,
  };
}
