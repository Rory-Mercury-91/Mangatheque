import {
  DEFAULT_ACTIVITY_LOG_FILTERS,
  type ActivityLogFilterAction,
  type ActivityLogFiltersState,
} from "@/types/activityLog";

const STORAGE_KEY = "mangatheque.activityLog.filters";

const ACTION_TYPE_SET = new Set<string>([
  "series_create",
  "volume_create",
  "series_delete",
  "volume_delete",
  "planning_update",
  "release_update",
  "anime_create",
  "anime_update",
  "anime_delete",
]);

/**
 * @description Valide les filtres journal lus depuis le stockage.
 */
function parseStoredFilters(raw: unknown): ActivityLogFiltersState {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_ACTIVITY_LOG_FILTERS };
  }
  const data = raw as Record<string, unknown>;
  const actionTypes = Array.isArray(data.actionTypes)
    ? data.actionTypes.filter(
        (value): value is ActivityLogFilterAction =>
          typeof value === "string" && ACTION_TYPE_SET.has(value),
      )
    : [];
  const userIds = Array.isArray(data.userIds)
    ? data.userIds.filter((value): value is string => typeof value === "string")
    : [];

  return {
    search: typeof data.search === "string" ? data.search : "",
    actionTypes,
    userIds,
  };
}

/**
 * @description Lit les filtres du journal d'activité (localStorage).
 */
export function readActivityLogFilters(): ActivityLogFiltersState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_ACTIVITY_LOG_FILTERS };
    }
    return parseStoredFilters(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ACTIVITY_LOG_FILTERS };
  }
}

/**
 * @description Persiste les filtres du journal d'activité.
 * @param filters - État courant des filtres.
 */
export function persistActivityLogFilters(
  filters: ActivityLogFiltersState,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Quota / mode privé.
  }
}
