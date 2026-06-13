import { scrapePayloadToFormValues } from "@/services/importMapService";
import type { Owner, ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";

/**
 * @description Valide un payload scrape v1.
 */
function assertScrapePayload(payload: Partial<ScrapePayloadV1>): ScrapePayloadV1 {
  if (payload.schemaVersion !== 1) {
    throw new Error(
      "Version de schéma non supportée (attendu : schemaVersion: 1).",
    );
  }

  if (!payload.title?.trim()) {
    throw new Error("Champ obligatoire manquant : title.");
  }

  if (!payload.sourceUrl?.trim()) {
    throw new Error("Champ obligatoire manquant : sourceUrl.");
  }

  return payload as ScrapePayloadV1;
}

/**
 * @description Valide et normalise un payload JSON d'import Nautiljon (schéma v1).
 * @param raw - Texte JSON collé ou lu depuis un fichier.
 * @throws Erreur en français si le format est invalide.
 */
export function parseScrapePayloadJson(raw: string): ScrapePayloadV1 {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Le JSON est vide.");
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error("JSON invalide — vérifiez le copier-coller depuis Nautiljon.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Le JSON doit être un objet.");
  }

  return assertScrapePayload(data as Partial<ScrapePayloadV1>);
}

/**
 * @description Parse un ou plusieurs payloads (export dual chapitres + tomes).
 * @param raw - JSON objet ou tableau de payloads.
 */
export function parseScrapePayloadJsonList(raw: string): ScrapePayloadV1[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Le JSON est vide.");
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error("JSON invalide — vérifiez le copier-coller depuis Nautiljon.");
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error("Le tableau JSON est vide.");
    }
    return data.map((item) => assertScrapePayload(item as Partial<ScrapePayloadV1>));
  }

  if (!data || typeof data !== "object") {
    throw new Error("Le JSON doit être un objet ou un tableau.");
  }

  return [assertScrapePayload(data as Partial<ScrapePayloadV1>)];
}

/**
 * @description Convertit un JSON d'import en valeurs de formulaire œuvre.
 * @param raw - Texte JSON exporté par le script Tampermonkey.
 * @param owners - Propriétaires du foyer (résolution compte Mihon).
 */
export function scrapePayloadJsonToFormValues(
  raw: string,
  owners: Owner[] = [],
): WorkFormValues {
  return scrapePayloadToFormValues(parseScrapePayloadJsonList(raw)[0], owners);
}
