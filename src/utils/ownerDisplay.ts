import type { EditionType, Owner } from "@/types/database";

/**
 * @description Première lettre du prénom pour badge compact.
 * @param name Nom du propriétaire.
 */
export function getOwnerInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

/**
 * @description Texte affiché sur la pastille (personnalisé ou initiale).
 * @param owner Propriétaire avec nom et libellé optionnel.
 */
export function getOwnerBadgeText(
  owner: Pick<Owner, "name" | "badge_label">,
): string {
  const custom = owner.badge_label?.trim();
  if (custom) {
    return custom.slice(0, 4);
  }
  return getOwnerInitial(owner.name);
}

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
