import type { WorkReadingStatus } from "@/types/database";

/** Racine par défaut des archives locales. */
export const DEFAULT_LOCAL_ARCHIVE_ROOT = String.raw`G:\01-Archives Alex`;

/** Clé localStorage pour surcharger la racine. */
export const LOCAL_ARCHIVE_ROOT_STORAGE_KEY = "mangatheque.localArchiveRoot";

/** Unité de comptage pour la complétude d'archive. */
export type LocalArchiveUnit = "volume" | "chapter";

/**
 * @description Libellé de dossier pour un statut série (hors incomplet).
 * Majuscule en début de chaque mot (ex. « En Attente », « Terminé »).
 */
export function getLocalArchiveStatusFolder(
  status: WorkReadingStatus,
): string {
  switch (status) {
    case "completed":
      return "Terminé";
    case "on_hold":
      return "En Attente";
    case "dropped":
      return "Abandonné";
    case "ongoing":
    default:
      return "En Cours";
  }
}

/** Libellé dossier pour une archive incomplète. */
export const LOCAL_ARCHIVE_INCOMPLETE_FOLDER = "Incomplet";

/** Tous les dossiers de statut possibles sous une démographie. */
export const LOCAL_ARCHIVE_STATUS_FOLDERS: readonly string[] = [
  LOCAL_ARCHIVE_INCOMPLETE_FOLDER,
  "En Cours",
  "En Attente",
  "Terminé",
  "Abandonné",
];

/** Valeur filtre bibliothèque : œuvres sans archive locale. */
export const LOCAL_ARCHIVE_FILTER_NONE = "__none__";

/** Options du filtre dossier d'archive (mode dév). */
export const LOCAL_ARCHIVE_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "", label: "Tous les dossiers" },
  { value: LOCAL_ARCHIVE_FILTER_NONE, label: "Sans archive" },
  { value: "Terminé", label: "Terminé" },
  { value: "En Cours", label: "En Cours" },
  { value: "En Attente", label: "En Attente" },
  { value: "Abandonné", label: "Abandonné" },
  { value: LOCAL_ARCHIVE_INCOMPLETE_FOLDER, label: "Incomplet" },
];

/**
 * @description Lit la racine d'archives (localStorage ou défaut).
 */
export function readLocalArchiveRoot(): string {
  try {
    const raw = localStorage.getItem(LOCAL_ARCHIVE_ROOT_STORAGE_KEY);
    const trimmed = raw?.trim();
    if (trimmed) {
      return trimmed.replace(/[/\\]+$/, "");
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOCAL_ARCHIVE_ROOT;
}

/**
 * @description Enregistre la racine d'archives en localStorage.
 */
export function writeLocalArchiveRoot(root: string): void {
  const trimmed = root.trim().replace(/[/\\]+$/, "");
  if (!trimmed) {
    return;
  }
  try {
    localStorage.setItem(LOCAL_ARCHIVE_ROOT_STORAGE_KEY, trimmed);
  } catch {
    // ignore
  }
}
