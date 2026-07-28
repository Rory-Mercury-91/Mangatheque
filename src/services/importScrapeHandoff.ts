import type { ScrapePayloadV1 } from "@/types/database";

/**
 * @description Handler qui peut « réclamer » un scrape pour une modale déjà ouverte.
 * @returns true si le payload a été consommé localement.
 */
export type ImportScrapeClaimHandler = (payload: ScrapePayloadV1) => boolean;

const claimHandlers = new Set<ImportScrapeClaimHandler>();

/**
 * @description Enregistre un récepteur prioritaire (ex. WorkFormModal déjà ouvert).
 * @param handler - Fonction de claim ; retourne true pour empêcher une 2ᵉ modale.
 * @returns Fonction de désabonnement.
 */
export function registerImportScrapeClaim(
  handler: ImportScrapeClaimHandler,
): () => void {
  claimHandlers.add(handler);
  return () => {
    claimHandlers.delete(handler);
  };
}

/**
 * @description Tente de livrer le scrape à une fiche déjà ouverte.
 * @param payload - Données Tampermonkey.
 * @returns true si un handler a consommé le payload.
 */
export function tryClaimImportScrape(payload: ScrapePayloadV1): boolean {
  for (const handler of claimHandlers) {
    if (handler(payload)) {
      return true;
    }
  }
  return false;
}
