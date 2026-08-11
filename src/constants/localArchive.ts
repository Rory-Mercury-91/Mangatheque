import type { WorkReadingStatus } from "@/types/database";

/** Racine par défaut des archives locales. */
export const DEFAULT_LOCAL_ARCHIVE_ROOT = String.raw`G:\01-Archives Alex`;

/** Clé localStorage legacy (racine globale, sans propriétaire). */
export const LOCAL_ARCHIVE_ROOT_STORAGE_KEY = "mangatheque.localArchiveRoot";

/** Préfixe localStorage pour une racine par propriétaire. */
export const LOCAL_ARCHIVE_ROOT_OWNER_KEY_PREFIX =
  "mangatheque.localArchiveRoot.";

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
 * @description Normalise un chemin racine (slash final retiré).
 */
function normalizeArchiveRoot(path: string): string {
  return path.trim().replace(/[/\\]+$/, "");
}

/**
 * @description Clé localStorage pour la racine d'un propriétaire.
 */
export function localArchiveRootOwnerStorageKey(ownerId: string): string {
  return `${LOCAL_ARCHIVE_ROOT_OWNER_KEY_PREFIX}${ownerId}`;
}

/**
 * @description Lit la racine d'archives legacy (globale) ou le défaut.
 */
export function readLocalArchiveRoot(): string {
  try {
    const raw = localStorage.getItem(LOCAL_ARCHIVE_ROOT_STORAGE_KEY);
    const trimmed = raw?.trim();
    if (trimmed) {
      return normalizeArchiveRoot(trimmed);
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOCAL_ARCHIVE_ROOT;
}

/**
 * @description Enregistre la racine d'archives legacy (globale) en localStorage.
 */
export function writeLocalArchiveRoot(root: string): void {
  const trimmed = normalizeArchiveRoot(root);
  if (!trimmed) {
    return;
  }
  try {
    localStorage.setItem(LOCAL_ARCHIVE_ROOT_STORAGE_KEY, trimmed);
  } catch {
    // ignore
  }
}

/**
 * @description Lit la racine configurée pour un propriétaire (sans fallback).
 * @returns Chemin ou `null` si non défini.
 */
export function readStoredLocalArchiveRootForOwner(
  ownerId: string | null | undefined,
): string | null {
  if (!ownerId) {
    return null;
  }
  try {
    const raw = localStorage.getItem(localArchiveRootOwnerStorageKey(ownerId));
    const trimmed = raw?.trim();
    if (trimmed) {
      return normalizeArchiveRoot(trimmed);
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * @description Racine effective pour un propriétaire : owner → legacy globale → défaut.
 */
export function readLocalArchiveRootForOwner(
  ownerId: string | null | undefined,
): string {
  return readStoredLocalArchiveRootForOwner(ownerId) ?? readLocalArchiveRoot();
}

/**
 * @description Enregistre la racine d'archives pour un propriétaire.
 */
export function writeLocalArchiveRootForOwner(
  ownerId: string,
  root: string,
): void {
  const trimmed = normalizeArchiveRoot(root);
  if (!ownerId || !trimmed) {
    return;
  }
  try {
    localStorage.setItem(localArchiveRootOwnerStorageKey(ownerId), trimmed);
  } catch {
    // ignore
  }
}

/**
 * @description Efface la racine spécifique d'un propriétaire (repli sur legacy / défaut).
 */
export function clearLocalArchiveRootForOwner(ownerId: string): void {
  if (!ownerId) {
    return;
  }
  try {
    localStorage.removeItem(localArchiveRootOwnerStorageKey(ownerId));
  } catch {
    // ignore
  }
}
