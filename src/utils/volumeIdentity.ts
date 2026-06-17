import type { EditionType } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";
import { formatEditionLabel } from "@/utils/ownerDisplay";
import { formatVolumeTitle } from "@/utils/volumeDisplay";

/** Identité minimale d'un tome pour dédoublonnage. */
export type VolumeIdentityInput = Pick<
  VolumeFormRow,
  "volumeNumber" | "volumeLabel" | "editionType"
>;

/**
 * @description Clé stable numéro/libellé + type d'édition.
 */
export function buildVolumeIdentityKey(volume: VolumeIdentityInput): string {
  if (volume.volumeNumber != null) {
    return `num:${volume.volumeNumber}|${volume.editionType}`;
  }

  const label = volume.volumeLabel?.trim();
  if (label) {
    return `label:${label}|${volume.editionType}`;
  }

  return "";
}

/**
 * @description Type d'édition opposé (Simple ↔ Collector).
 */
export function getAlternateEditionType(editionType: EditionType): EditionType {
  return editionType === "classic" ? "collector" : "classic";
}

/**
 * @description Indique si un tome entre en conflit avec un autre de la série.
 */
export function isDuplicateVolume(
  candidate: VolumeIdentityInput,
  siblings: VolumeIdentityInput[],
  excludeId?: string,
): boolean {
  const key = buildVolumeIdentityKey(candidate);
  if (!key) {
    return false;
  }

  return siblings.some(
    (row) =>
      (!("id" in row) || (row as VolumeFormRow).id !== excludeId) &&
      buildVolumeIdentityKey(row) === key,
  );
}

/**
 * @description Message d'erreur lorsqu'une combinaison numéro + édition existe déjà.
 */
export function formatVolumeDuplicateError(
  volume: VolumeIdentityInput,
  trackingUnit: "volume" | "chapter" = "volume",
): string {
  const title = formatVolumeTitle(
    volume.volumeNumber,
    volume.volumeLabel,
    trackingUnit,
  );
  const edition = formatEditionLabel(volume.editionType);
  return `Un tome « ${title} » en édition ${edition} existe déjà pour cette série.`;
}

/**
 * @description Indique si la variante Simple/Collector peut être dupliquée.
 */
export function canDuplicateVolumeEdition(
  volume: VolumeFormRow,
  siblings: VolumeFormRow[],
): boolean {
  if (volume.volumeNumber == null && !volume.volumeLabel?.trim()) {
    return false;
  }

  const alternate: VolumeFormRow = {
    ...volume,
    id: undefined,
    editionType: getAlternateEditionType(volume.editionType),
  };

  return !isDuplicateVolume(alternate, siblings, volume.id);
}

/**
 * @description Libellé du bouton de duplication vers l'autre édition.
 */
export function getDuplicateVolumeEditionLabel(editionType: EditionType): string {
  const target = getAlternateEditionType(editionType);
  return `Créer en ${formatEditionLabel(target)}`;
}

/**
 * @description Vérifie l'absence de doublons dans une liste de tomes formulaire.
 * @throws Error si deux tomes partagent numéro/libellé et édition.
 */
export function assertUniqueVolumeRows(
  volumes: VolumeFormRow[],
  trackingUnit: "volume" | "chapter" = "volume",
): void {
  const seen = new Set<string>();

  for (const volume of volumes) {
    const key = buildVolumeIdentityKey(volume);
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      throw new Error(formatVolumeDuplicateError(volume, trackingUnit));
    }
    seen.add(key);
  }
}
