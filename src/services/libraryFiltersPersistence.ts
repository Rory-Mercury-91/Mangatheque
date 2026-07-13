import type { UserReadingStatus } from "@/constants/userReadingStatus";
import type { WorkReadingStatus } from "@/types/database";
import {
  DEFAULT_LIBRARY_FILTERS,
  isLibraryOwnerFilterMode,
  isLibrarySortKey,
  type LibraryFiltersState,
  type LibraryMihonFilter,
  type LibraryOwnerFilterMode,
} from "@/types/libraryFilters";

const STORAGE_PREFIX = "mangatheque.libraryFilters";
const PRESET_STORAGE_KEY = "mangatheque.libraryFilterPreset";

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

function parseOwnerFilterById(
  data: Record<string, unknown>,
  mihonFilter: LibraryMihonFilter,
): LibraryFiltersState["ownerFilterById"] {
  const raw = data.ownerFilterById;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const parsed: LibraryFiltersState["ownerFilterById"] = {};
    for (const [ownerId, mode] of Object.entries(raw)) {
      if (typeof mode === "string" && isLibraryOwnerFilterMode(mode)) {
        parsed[ownerId] = mode;
      }
    }
    return parsed;
  }

  const legacyOwnerIds = isStringArray(data.ownerIds) ? data.ownerIds : [];
  if (legacyOwnerIds.length === 0) {
    return {};
  }

  const legacyMode: LibraryOwnerFilterMode =
    mihonFilter === "exclude" ? "physical" : "any";

  return Object.fromEntries(
    legacyOwnerIds.map((ownerId) => [ownerId, legacyMode]),
  );
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

  const ownerFilterById = parseOwnerFilterById(data, mihonFilter);
  const demographics = isStringArray(data.demographics) ? data.demographics : [];
  const tags = isStringArray(data.tags) ? data.tags : [];
  const favoriteOwnerIds = isStringArray(data.favoriteOwnerIds)
    ? data.favoriteOwnerIds
    : [];

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
    ownerFilterById,
    mihonFilter,
    readingStatuses,
    userReadingStatuses,
    demographics,
    tags,
    favoriteOwnerIds,
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

/**
 * @description Mémorise un jeu de filtres à appliquer à la prochaine ouverture bibliothèque.
 * @param filters - Filtres complets à appliquer (ex. depuis le tableau de bord).
 */
export function saveLibraryFilterPreset(filters: LibraryFiltersState): void {
  try {
    sessionStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Quota ou mode privé — ignorer silencieusement.
  }
}

/**
 * @description Lit puis supprime un preset bibliothèque en attente.
 */
export function consumeLibraryFilterPreset(): LibraryFiltersState | null {
  try {
    const raw = sessionStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    sessionStorage.removeItem(PRESET_STORAGE_KEY);
    return parseStoredLibraryFilters(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * @description Construit les filtres bibliothèque depuis une carte propriétaire du tableau de bord.
 * @param ownerId - Identifiant du propriétaire ciblé.
 */
export function buildOwnerLibraryFilterPreset(ownerId: string): LibraryFiltersState {
  return {
    ...DEFAULT_LIBRARY_FILTERS,
    ownerFilterById: { [ownerId]: "any" },
    mihonFilter: "exclude",
  };
}

/**
 * @description Construit les filtres bibliothèque pour les séries avec Mihon.
 */
export function buildMihonLibraryFilterPreset(): LibraryFiltersState {
  return {
    ...DEFAULT_LIBRARY_FILTERS,
    mihonFilter: "only",
  };
}

/**
 * @description Construit les filtres bibliothèque pour un statut « Ma lecture ».
 * @param status - Statut personnel ciblé.
 * @param ownerId - Propriétaire optionnel (mode présent).
 */
export function buildUserReadingLibraryFilterPreset(
  status: UserReadingStatus,
  ownerId?: string,
): LibraryFiltersState {
  return {
    ...DEFAULT_LIBRARY_FILTERS,
    userReadingStatuses: [status],
    ownerFilterById: ownerId ? { [ownerId]: "any" } : {},
  };
}

const TAGS_PANEL_HEIGHT_KEY = "mangatheque.libraryTagsPanelHeight";

/** Hauteur par défaut du volet tags bibliothèque (px). */
export const DEFAULT_LIBRARY_TAGS_PANEL_HEIGHT = 120;

/** Hauteur minimale du volet tags bibliothèque (px). */
export const MIN_LIBRARY_TAGS_PANEL_HEIGHT = 72;

/** Hauteur maximale du volet tags bibliothèque (px). */
export const MAX_LIBRARY_TAGS_PANEL_HEIGHT = 520;

/**
 * @description Lit la hauteur mémorisée du volet tags bibliothèque.
 */
export function readLibraryTagsPanelHeight(): number {
  if (typeof window === "undefined") {
    return DEFAULT_LIBRARY_TAGS_PANEL_HEIGHT;
  }

  const raw = window.localStorage.getItem(TAGS_PANEL_HEIGHT_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIBRARY_TAGS_PANEL_HEIGHT;
  }

  return Math.min(
    MAX_LIBRARY_TAGS_PANEL_HEIGHT,
    Math.max(MIN_LIBRARY_TAGS_PANEL_HEIGHT, Math.round(parsed)),
  );
}

/**
 * @description Mémorise la hauteur du volet tags bibliothèque.
 * @param height - Hauteur en pixels.
 */
export function persistLibraryTagsPanelHeight(height: number): number {
  const normalized = Math.min(
    MAX_LIBRARY_TAGS_PANEL_HEIGHT,
    Math.max(MIN_LIBRARY_TAGS_PANEL_HEIGHT, Math.round(height)),
  );

  if (typeof window !== "undefined") {
    window.localStorage.setItem(TAGS_PANEL_HEIGHT_KEY, String(normalized));
  }

  return normalized;
}
