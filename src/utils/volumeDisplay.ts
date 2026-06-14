import type { TrackingUnit } from "@/types/database";
import { formatVolumeNumberDisplay } from "@/utils/volumeNumber";

/**
 * @description Libellé singulier de l'unité (tome / chapitre).
 */
export function getTrackingUnitLabel(unit: TrackingUnit): string {
  return unit === "chapter" ? "Chapitre" : "Tome";
}

/**
 * @description Libellé pluriel de l'unité (tomes / chapitres).
 */
export function getTrackingUnitLabelPlural(unit: TrackingUnit): string {
  return unit === "chapter" ? "Chapitres" : "Tomes";
}

/**
 * @description Compte avec accord (« 7 Tomes » / « 1 Chapitre »).
 */
export function formatTrackingUnitCount(
  count: number,
  unit: TrackingUnit,
): string {
  const label =
    count > 1 ? getTrackingUnitLabelPlural(unit) : getTrackingUnitLabel(unit);
  return `${count} ${label}`;
}

/**
 * @description Libellé affiché pour une unité numérotée ou hors-série.
 * @param volumeNumber - Numéro en base (tome ou chapitre).
 * @param volumeLabel - Libellé Nautiljon optionnel (fanbook, plage…).
 * @param trackingUnit - Unité de suivi de la série.
 */
export function formatVolumeTitle(
  volumeNumber: number | null | undefined,
  volumeLabel?: string | null,
  trackingUnit: TrackingUnit = "volume",
): string {
  const label = volumeLabel?.trim();
  if (label) {
    return label;
  }
  if (volumeNumber != null) {
    return `${getTrackingUnitLabel(trackingUnit)} ${formatVolumeNumberDisplay(volumeNumber)}`;
  }
  return "Hors-série";
}
