import type { WorkReadingStatus } from "@/types/database";

export type WorkStatusOption = {
  value: WorkReadingStatus;
  label: string;
  color: string;
};

export const WORK_STATUS_OPTIONS: WorkStatusOption[] = [
  { value: "ongoing", label: "En cours", color: "#3b82f6" },
  { value: "dropped", label: "Abandonnée", color: "#eab308" },
  { value: "completed", label: "Terminée", color: "#22c55e" },
];

const STATUS_BY_VALUE = new Map(
  WORK_STATUS_OPTIONS.map((option) => [option.value, option]),
);

/**
 * @description Retourne le libellé français d'un statut œuvre.
 * @param status - Code technique en base.
 */
export function getWorkStatusLabel(status: WorkReadingStatus): string {
  return STATUS_BY_VALUE.get(status)?.label ?? "En cours";
}

/**
 * @description Retourne la couleur d'affichage d'un statut œuvre.
 * @param status - Code technique en base.
 */
export function getWorkStatusColor(status: WorkReadingStatus): string {
  return STATUS_BY_VALUE.get(status)?.color ?? "#3b82f6";
}

/**
 * @description Normalise une valeur lue en base vers un statut connu.
 * @param value - Valeur brute Supabase.
 */
export function normalizeWorkReadingStatus(
  value: string | null | undefined,
): WorkReadingStatus {
  if (value === "dropped" || value === "completed") {
    return value;
  }
  return "ongoing";
}
