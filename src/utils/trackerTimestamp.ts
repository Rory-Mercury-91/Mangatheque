/**
 * @description Parse un horodatage tracker (ISO MAL ou epoch AniList) en ms.
 */
export function parseTrackerTimestamp(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // AniList : secondes ; valeurs déjà en ms si > ~1e12
    return value < 1e12 ? value * 1000 : value;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}
