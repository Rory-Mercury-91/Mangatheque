/**
 * @description Libellé affiché pour un tome (numéroté ou hors-série).
 * @param volumeNumber - Numéro du tome en base.
 * @param volumeLabel - Libellé Nautiljon optionnel (fanbook, guide…).
 */
export function formatVolumeTitle(
  volumeNumber: number | null | undefined,
  volumeLabel?: string | null,
): string {
  const label = volumeLabel?.trim();
  if (label) {
    return label;
  }
  if (volumeNumber != null) {
    return `Tome ${volumeNumber}`;
  }
  return "Hors-série";
}
