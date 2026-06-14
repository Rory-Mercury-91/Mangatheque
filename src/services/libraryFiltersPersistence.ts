import type { UserReadingStatus } from "@/constants/userReadingStatus";
import type { WorkReadingStatus } from "@/types/database";
import {
  isLibrarySortKey,
  type LibraryFiltersState,
  type LibraryMihonFilter,
} from "@/types/libraryFilters";

const STORAGE_PREFIX = "mangatheque.libraryFilters";

const WORK_READING_STATUS_SET = new Set<WorkReadingStatus>([
  "ongoing",
  "on_hold",
  "dropped",
  "completed",
]);

const USER_READING_STATUS_SET = new Set<UserReadingStatus>([
  "to_read",
  "ongoing",
  "completed",
  "abandoned",
]);

const MIHON_FILTER_SET = new Set<LibraryMihonFilter>(["all", "only", "exclude"]);

/**
 * @description Clé sessionStorage des filtres bibliothèque (par compte).
 */
function getLibraryFiltersStorageKey(userId: string | null): string {
  return userId
    ? `${STORAGE_PREFIX}.${userId}`
    : `${STORAGE_PREFIX}.anonymous`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseStoredLibraryFilters(raw: unknown): LibraryFiltersState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const sortRaw = data.sort;
  if (typeof sortRaw !== "string" || !isLibrarySortKey(sortRaw)) {
    return null;
  }

  const mihonRaw = data.mihonFilter;
  const mihonFilter =
    typeof mihonRaw === "string" && MIHON_FILTER_SET.has(mihonRaw as LibraryMihonFilter)
      ? (mihonRaw as LibraryMihonFilter)
      : "all";

  const ownerIds = isStringArray(data.ownerIds) ? data.ownerIds : [];
  const demographics = isStringArray(data.demographics) ? data.demographics : [];
  const tags = isStringArray(data.tags) ? data.tags : [];

  const readingStatuses = isStringArray(data.readingStatuses)
    ? data.readingStatuses.filter((value): value is WorkReadingStatus =>
        WORK_READING_STATUS_SET.has(value as WorkReadingStatus),
      )
    : [];

  const userReadingStatuses = isStringArray(data.userReadingStatuses)
    ? data.userReadingStatuses.filter((value): value is UserReadingStatus =>
        USER_READING_STATUS_SET.has(value as UserReadingStatus),
      )
    : [];

  return {
    search: typeof data.search === "string" ? data.search : "",
    sort: sortRaw,
    ownerIds,
    mihonFilter,
    readingStatuses,
    userReadingStatuses,
    demographics,
    tags,
  };
}

/**
 * @description Lit les filtres bibliothèque mémorisés pour la session courante.
 * @param userId - Identifiant auth ou null (visiteur).
 */
export function readStoredLibraryFilters(
  userId: string | null,
): LibraryFiltersState | null {
  try {
    const raw = sessionStorage.getItem(getLibraryFiltersStorageKey(userId));
    if (!raw) {
      return null;
    }
    return parseStoredLibraryFilters(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * @description Enregistre les filtres bibliothèque pour la session courante.
 * @param userId - Identifiant auth ou null (visiteur).
 * @param filters - État complet des filtres.
 */
export function persistLibraryFilters(
  userId: string | null,
  filters: LibraryFiltersState,
): void {
  try {
    sessionStorage.setItem(
      getLibraryFiltersStorageKey(userId),
      JSON.stringify(filters),
    );
  } catch {
    // Quota ou mode privé — ignorer silencieusement.
  }
}

/**
 * @description Supprime les filtres mémorisés (réinitialisation explicite).
 * @param userId - Identifiant auth ou null (visiteur).
 */
export function clearStoredLibraryFilters(userId: string | null): void {
  try {
    sessionStorage.removeItem(getLibraryFiltersStorageKey(userId));
  } catch {
    // Ignorer.
  }
}
