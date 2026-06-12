import type { EditionType } from "@/types/database";

/**
 * @description Libellé d'édition affiché à l'utilisateur.
 * @param editionType Type technique en base.
 */
export function formatEditionLabel(editionType: EditionType): string {
  return editionType === "collector" ? "Collector" : "Simple";
}

/**
 * @description Formate un montant en euros (fr-FR).
 * @param amount Montant numérique.
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}
