/** Statut de lecture personnel dérivé de la progression et des préférences. */
export type UserReadingStatus = "to_read" | "ongoing" | "completed" | "abandoned";

export type UserReadingStatusOption = {
  value: UserReadingStatus;
  label: string;
  color: string;
};

export const USER_READING_STATUS_OPTIONS: UserReadingStatusOption[] = [
  { value: "to_read", label: "À lire", color: "#c8d4e6" },
  { value: "ongoing", label: "En cours", color: "#6366f1" },
  { value: "completed", label: "Terminée", color: "#14b8a6" },
  { value: "abandoned", label: "Abandonnée", color: "#f97316" },
];

const STATUS_BY_VALUE = new Map(
  USER_READING_STATUS_OPTIONS.map((option) => [option.value, option]),
);

/**
 * @description Calcule le statut « Ma lecture » à partir de la progression.
 * @param readCount - Tomes ou chapitres lus.
 * @param totalCount - Total suiviable.
 * @param isAbandoned - Override utilisateur « abandonnée ».
 */
export function deriveUserReadingStatus(
  readCount: number,
  totalCount: number,
  isAbandoned: boolean,
): UserReadingStatus {
  if (isAbandoned) {
    return "abandoned";
  }
  if (totalCount <= 0 || readCount <= 0) {
    return "to_read";
  }
  if (readCount >= totalCount) {
    return "completed";
  }
  return "ongoing";
}

/**
 * @description Libellé français d'un statut « Ma lecture ».
 */
export function getUserReadingStatusLabel(status: UserReadingStatus): string {
  return STATUS_BY_VALUE.get(status)?.label ?? "À lire";
}

/**
 * @description Couleur d'affichage d'un statut « Ma lecture ».
 */
export function getUserReadingStatusColor(status: UserReadingStatus): string {
  return STATUS_BY_VALUE.get(status)?.color ?? "#c8d4e6";
}
