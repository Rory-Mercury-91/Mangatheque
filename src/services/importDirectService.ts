import type { Owner, ScrapePayloadV1 } from "@/types/database";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import { createWorkWithVolumes } from "@/services/workService";

/**
 * @description Crée une série en base depuis un payload Nautiljon sans modale de contrôle.
 * @param payload - Données scrapées validées côté userscript.
 * @param owners - Propriétaires du foyer (résolution Mihon / achat).
 * @returns Titre de la série créée.
 */
export async function importScrapePayloadDirectly(
  payload: ScrapePayloadV1,
  owners: Owner[],
): Promise<string> {
  const form = scrapePayloadToFormValues(payload, owners);
  const workId = await createWorkWithVolumes(form);
  return form.title.trim() || workId;
}
