import { scrapePayloadToFormValues } from "@/services/importMapService";
import type { ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";

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

  const payload = data as Partial<ScrapePayloadV1>;

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
 * @description Convertit un JSON d'import en valeurs de formulaire œuvre.
 * @param raw - Texte JSON exporté par le script Tampermonkey.
 */
export function scrapePayloadJsonToFormValues(raw: string): WorkFormValues {
  return scrapePayloadToFormValues(parseScrapePayloadJson(raw));
}
