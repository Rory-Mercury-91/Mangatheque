import type { Owner, ScrapePayloadV1 } from "@/types/database";
import {
  prepareImportMergeIfDuplicate,
  type ImportMergePreview,
} from "@/services/importMergeService";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import { createWorkWithVolumes } from "@/services/workService";

/** Résultat d'un import direct Nautiljon. */
export type DirectImportOutcome =
  | { status: "created"; title: string }
  | { status: "merge_required"; preview: ImportMergePreview }
  | { status: "already_up_to_date"; title: string };

/**
 * @description Résout un import direct : vérifie les doublons avant toute création.
 * @param payload - Données scrapées validées côté userscript.
 * @param owners - Propriétaires du foyer (résolution Mihon / achat).
 */
export async function resolveDirectImport(
  payload: ScrapePayloadV1,
  owners: Owner[],
): Promise<DirectImportOutcome> {
  const form = scrapePayloadToFormValues(payload, owners);
  const preview = await prepareImportMergeIfDuplicate(form, owners);

  if (preview) {
    if (preview.hasChanges) {
      return { status: "merge_required", preview };
    }
    return { status: "already_up_to_date", title: preview.workTitle };
  }

  const workId = await createWorkWithVolumes(form);
  return { status: "created", title: form.title.trim() || workId };
}

/**
 * @description Crée une série en base depuis un payload Nautiljon sans modale de contrôle.
 * @deprecated Préférer resolveDirectImport qui vérifie les doublons avant création.
 */
export async function importScrapePayloadDirectly(
  payload: ScrapePayloadV1,
  owners: Owner[],
): Promise<string> {
  const outcome = await resolveDirectImport(payload, owners);
  if (outcome.status === "merge_required") {
    throw new Error(
      `La série « ${outcome.preview.workTitle} » existe déjà dans la bibliothèque.`,
    );
  }
  return outcome.title;
}
