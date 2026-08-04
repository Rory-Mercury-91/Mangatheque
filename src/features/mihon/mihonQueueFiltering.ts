import {
  sortMihonQueueWorks,
  type MihonQueueSortDir,
  type MihonQueueSortKey,
} from "@/features/mihon/MihonImportQueueTable";
import type { MihonIgnoredEntry } from "@/services/mihon/mihonIgnoreService";
import type { MihonQuickFilter } from "@/services/mihon/mihonQueueUiPersistence";
import type { WorkMihonSource } from "@/services/mihon/workMihonSourceService";
import type { Work } from "@/types/database";
import { formatMihonSourceDisplay } from "@/utils/mihonSourceDisplay";
import { matchesNormalizedSearch } from "@/utils/textNormalize";

/** Option du select « Filtrer par source ». */
export interface MihonSourceFilterOption {
  id: string;
  label: string;
  count: number;
}

/**
 * @description Construit les options de filtre source présentes dans la file.
 */
export function buildMihonSourceFilterOptions(
  pending: Work[],
  sourcesByWorkId: Map<string, WorkMihonSource[]>,
  knownSourceNames: ReadonlyMap<string, string>,
): MihonSourceFilterOption[] {
  const byId = new Map<string, MihonSourceFilterOption>();

  const bump = (
    sourceId: string | null | undefined,
    sourceName: string | null | undefined,
  ) => {
    const id = sourceId?.trim() || "";
    if (!id) return;
    const display = formatMihonSourceDisplay(id, sourceName, knownSourceNames);
    const existing = byId.get(id);
    if (existing) {
      existing.count += 1;
      return;
    }
    byId.set(id, { id, label: display.label, count: 1 });
  };

  for (const work of pending) {
    const sources = sourcesByWorkId.get(work.id) ?? [];
    if (sources.length > 0) {
      for (const source of sources) {
        bump(source.sourceId, source.sourceName);
      }
    } else {
      bump(work.mihon_source_id, work.mihon_source_name);
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "fr", { sensitivity: "base" }),
  );
}

/**
 * @description Filtre et trie la file pending selon les critères UI.
 */
export function filterAndSortMihonPending(
  pending: Work[],
  options: {
    quickFilter: MihonQuickFilter;
    sourceFilterId: string;
    searchQuery: string;
    sourcesByWorkId: Map<string, WorkMihonSource[]>;
    knownSourceNames: ReadonlyMap<string, string>;
    sortKey: MihonQueueSortKey;
    sortDir: MihonQueueSortDir;
  },
): Work[] {
  if (options.quickFilter === "ignored") {
    return [];
  }

  let rows = pending;
  switch (options.quickFilter) {
    case "sans-mal":
      rows = rows.filter((work) => work.mal_id == null);
      break;
    case "avec-mal":
      rows = rows.filter((work) => work.mal_id != null);
      break;
    case "sans-anilist":
      rows = rows.filter((work) => work.anilist_id == null);
      break;
    case "avec-anilist":
      rows = rows.filter((work) => work.anilist_id != null);
      break;
    default:
      break;
  }

  if (options.sourceFilterId) {
    rows = rows.filter((work) => {
      const sources = options.sourcesByWorkId.get(work.id) ?? [];
      if (sources.length > 0) {
        return sources.some(
          (source) => source.sourceId.trim() === options.sourceFilterId,
        );
      }
      return (work.mihon_source_id ?? "").trim() === options.sourceFilterId;
    });
  }

  const query = options.searchQuery.trim();
  if (query) {
    rows = rows.filter((work) => {
      const sources = options.sourcesByWorkId.get(work.id) ?? [];
      const sourceLabels = sources.flatMap((source) => [
        source.sourceName,
        source.sourceId,
      ]);
      return matchesNormalizedSearch(
        [
          work.title,
          work.mihon_source_name,
          work.mihon_source_id,
          work.mal_id != null ? String(work.mal_id) : null,
          work.anilist_id != null ? String(work.anilist_id) : null,
          ...sourceLabels,
        ],
        query,
      );
    });
  }

  return sortMihonQueueWorks(
    rows,
    options.sourcesByWorkId,
    options.knownSourceNames,
    options.sortKey,
    options.sortDir,
  );
}

/**
 * @description Filtre la liste des entrées ignorées.
 */
export function filterMihonIgnored(
  ignoredEntries: MihonIgnoredEntry[],
  quickFilter: MihonQuickFilter,
  searchQuery: string,
): MihonIgnoredEntry[] {
  if (quickFilter !== "ignored") {
    return [];
  }
  const query = searchQuery.trim();
  if (!query) {
    return ignoredEntries;
  }
  return ignoredEntries.filter((entry) =>
    matchesNormalizedSearch(
      [
        entry.title,
        entry.malId != null ? String(entry.malId) : null,
        entry.anilistId != null ? String(entry.anilistId) : null,
        ...entry.catalogKeys,
      ],
      query,
    ),
  );
}

/**
 * @description Découpe une liste pour la page courante.
 */
export function paginateItems<T>(
  items: T[],
  currentPage: number,
  pageSize: number,
): T[] {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
