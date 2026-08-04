import type {
  MihonQueueSortDir,
  MihonQueueSortKey,
} from "@/features/mihon/MihonImportQueueTable";

const STORAGE_KEY = "mangatheque.mihonQueue.uiPrefs";

/** Filtres rapides du sas Mihon. */
export type MihonQuickFilter =
  | "all"
  | "sans-mal"
  | "avec-mal"
  | "sans-anilist"
  | "avec-anilist"
  | "ignored";

/** Taille de page du tableau sas Mihon. */
export const MIHON_QUEUE_PAGE_SIZE = 100;

/** Préférences UI du sas Mihon (filtres, tri, compte, page). */
export interface MihonQueueUiPrefs {
  quickFilter: MihonQuickFilter;
  sourceFilterId: string;
  searchQuery: string;
  sortKey: MihonQueueSortKey;
  sortDir: MihonQueueSortDir;
  backupMihonOwnerId: string | null;
  currentPage: number;
}

const DEFAULT_PREFS: MihonQueueUiPrefs = {
  quickFilter: "all",
  sourceFilterId: "",
  searchQuery: "",
  sortKey: "title",
  sortDir: "asc",
  backupMihonOwnerId: null,
  currentPage: 1,
};

const QUICK_FILTERS: ReadonlySet<string> = new Set([
  "all",
  "sans-mal",
  "avec-mal",
  "sans-anilist",
  "avec-anilist",
  "ignored",
]);

const SORT_KEYS: ReadonlySet<string> = new Set([
  "title",
  "mal",
  "anilist",
  "source",
]);

/**
 * @description Valide et normalise les préférences UI lues depuis le stockage.
 */
function parsePrefs(raw: unknown): MihonQueueUiPrefs {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PREFS };
  }
  const data = raw as Record<string, unknown>;
  const quickFilter = String(data.quickFilter ?? "");
  const sortKey = String(data.sortKey ?? "");
  const sortDir = String(data.sortDir ?? "");

  return {
    quickFilter: QUICK_FILTERS.has(quickFilter)
      ? (quickFilter as MihonQuickFilter)
      : DEFAULT_PREFS.quickFilter,
    sourceFilterId:
      typeof data.sourceFilterId === "string" ? data.sourceFilterId : "",
    searchQuery: typeof data.searchQuery === "string" ? data.searchQuery : "",
    sortKey: SORT_KEYS.has(sortKey)
      ? (sortKey as MihonQueueSortKey)
      : DEFAULT_PREFS.sortKey,
    sortDir: sortDir === "desc" || sortDir === "asc" ? sortDir : "asc",
    backupMihonOwnerId:
      typeof data.backupMihonOwnerId === "string" &&
      data.backupMihonOwnerId.trim()
        ? data.backupMihonOwnerId
        : null,
    currentPage:
      typeof data.currentPage === "number" &&
      Number.isFinite(data.currentPage) &&
      data.currentPage >= 1
        ? Math.floor(data.currentPage)
        : DEFAULT_PREFS.currentPage,
  };
}

/**
 * @description Lit les derniers filtres / tri du sas Mihon (localStorage).
 */
export function readMihonQueueUiPrefs(): MihonQueueUiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFS };
    }
    return parsePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * @description Persiste les filtres / tri du sas Mihon.
 * @param prefs - État UI courant.
 */
export function persistMihonQueueUiPrefs(prefs: MihonQueueUiPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota / mode privé.
  }
}
