import {
  applyImportOwnershipToFormValues,
  scrapePayloadToFormValues,
} from "@/services/importMapService";
import { parseScrapePayloadJsonList } from "@/services/importJsonService";
import { mergeImportFormValues } from "@/services/importMergeService";
import { fetchOwners } from "@/services/ownerService";
import { fillMissingTrackerIds } from "@/services/tracker/trackerIdResolveService";
import {
  fetchWorkForEdit,
  updateWorkWithVolumes,
  workToFormValues,
} from "@/services/workService";
import type { Owner, ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";

/**
 * @description Fusionne plusieurs payloads scrape (export dual) en un formulaire.
 */
function scrapePayloadsToMergedForm(
  payloads: ScrapePayloadV1[],
  owners: Owner[],
): WorkFormValues {
  let form = scrapePayloadToFormValues(payloads[0]!, owners);
  for (let index = 1; index < payloads.length; index += 1) {
    form = mergeImportFormValues(
      form,
      scrapePayloadToFormValues(payloads[index]!, owners),
    );
  }
  return form;
}

export interface EnrichWorkResult {
  workId: string;
  title: string;
  clearedFromSas: boolean;
}

/**
 * @description Enrichit une fiche existante avec un ou plusieurs payloads Nautiljon.
 * Conserve Mihon + MAL/AniList locaux ; applique mihonOwnerName / ownerNames ;
 * sort du sas si l'URL source est Nautiljon.
 */
export async function enrichWorkFromScrapePayloads(
  workId: string,
  payloads: ScrapePayloadV1[],
  owners: Owner[] = [],
): Promise<EnrichWorkResult> {
  if (payloads.length === 0) {
    throw new Error("Aucune donnée Nautiljon à appliquer.");
  }

  const ownersList = owners.length > 0 ? owners : await fetchOwners();
  if (ownersList.length === 0) {
    throw new Error(
      "Aucun propriétaire chargé — impossible d'appliquer le compte Mihon.",
    );
  }

  const { work, volumes } = await fetchWorkForEdit(workId);
  const existing = workToFormValues(work, volumes);
  const incoming = scrapePayloadsToMergedForm(payloads, ownersList);

  let merged = mergeImportFormValues(existing, incoming);

  // Préserve explicitement les données Mihon catalogue / trackers locaux.
  merged.mihonSourceId = existing.mihonSourceId;
  merged.mihonSourceName = existing.mihonSourceName;
  merged.mihonCatalogUrl = existing.mihonCatalogUrl;
  merged.enrichmentStatus = existing.enrichmentStatus;
  merged.malId = existing.malId ?? merged.malId;
  merged.anilistId = existing.anilistId ?? merged.anilistId;

  // Titre + cover Nautiljon prioritaires (même si merge a déjà traité sourceUrl).
  const nautiljonTitle = incoming.title.trim();
  if (nautiljonTitle && /nautiljon\.com/i.test(incoming.sourceUrl.trim())) {
    merged.title = nautiljonTitle;
  }
  const nautiljonCover = incoming.coverUrl.trim();
  if (nautiljonCover) {
    merged.coverUrl = nautiljonCover;
  }

  // Ré-applique l'appartenance avec la liste owners (évite mihonOwnerName perdu).
  for (const payload of payloads) {
    merged = applyImportOwnershipToFormValues(merged, ownersList, payload);
  }

  const requestedMihonNames = [
    ...new Set(
      payloads
        .map((payload) => payload.mihonOwnerName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  if (requestedMihonNames.length > 0) {
    const applied = merged.volumes.some(
      (volume) => volume.mihonOwnerIds.length > 0,
    );
    if (!applied) {
      throw new Error(
        `Compte Mihon « ${requestedMihonNames.join(", ")} » non appliqué — vérifiez que le nom existe parmi les propriétaires du foyer.`,
      );
    }
  }

  const filled = await fillMissingTrackerIds({
    malId: merged.malId,
    anilistId: merged.anilistId,
  });
  merged.malId = filled.malId;
  merged.anilistId = filled.anilistId;

  await updateWorkWithVolumes(workId, merged);

  const { work: after } = await fetchWorkForEdit(workId);
  return {
    workId,
    title: after.title,
    clearedFromSas: after.enrichment_status == null,
  };
}

/**
 * @description Enrichit une fiche pending_mihon avec un export JSON Nautiljon.
 */
export async function enrichPendingMihonFromScrapeJson(
  workId: string,
  rawJson: string,
  owners: Owner[] = [],
): Promise<EnrichWorkResult> {
  const payloads = parseScrapePayloadJsonList(rawJson);
  return enrichWorkFromScrapePayloads(workId, payloads, owners);
}
