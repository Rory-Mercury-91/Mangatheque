import type { UserReadingStatus } from "@/constants/userReadingStatus";
import type { Work } from "@/types/database";
import type {
  LibraryUserReadingMeta,
  LibraryWorkMeta,
} from "@/types/libraryFilters";
import type {
  ReadingStatsOwnerScope,
  ReadingStatsSnapshot,
  ReadingWorkItem,
} from "@/types/readingStats";

/**
 * @description Indique si une œuvre a une possession (achat / Mihon) pour le compteur info.
 */
function workMatchesOwnerScope(
  meta: LibraryWorkMeta | undefined,
  scope: ReadingStatsOwnerScope,
): boolean {
  if (!meta) {
    return false;
  }
  const ownerIds = meta.ownerIds ?? [];
  const mihonOwnerIds = meta.mihonOwnerIds ?? [];
  if (scope === "all") {
    return ownerIds.length > 0 || mihonOwnerIds.length > 0;
  }
  return ownerIds.includes(scope) || mihonOwnerIds.includes(scope);
}

/**
 * @description Calcule le pourcentage de progression (0–100).
 */
function computeProgressPercent(readCount: number, totalCount: number): number {
  if (totalCount <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((readCount / totalCount) * 100));
}

/**
 * @description Construit une ligne série pour le suivi de lecture.
 */
function toReadingWorkItem(
  work: Work,
  reading: LibraryUserReadingMeta,
): ReadingWorkItem {
  return {
    workId: work.id,
    title: work.title,
    coverUrl: work.cover_url,
    userReadingStatus: reading.userReadingStatus,
    volumesRead: reading.volumesRead,
    volumesTotal: reading.volumesTotal,
    chaptersRead: reading.chaptersRead,
    chaptersTotal: reading.chaptersTotal,
    progressPercent: computeProgressPercent(
      reading.readCount,
      reading.totalCount,
    ),
    lastActivityAt: reading.lastActivityAt,
  };
}

/**
 * @description Agrège les statistiques de lecture pour la page dédiée.
 *
 * Catalogue = **toutes** les séries de la bibliothèque.
 * Progression = compte auth ciblé (toggle = liaison propriétaire ↔ compte).
 * Le compteur « séries possédées » reste informatif (possession physique / Mihon).
 *
 * @param works - Toutes les séries de la bibliothèque.
 * @param readingMetaByWork - Progression du compte auth ciblé.
 * @param workMetaByWork - Possession (compteur info uniquement).
 * @param ownerScope - Compte / propriétaire sélectionné (pour ownedWorkCount).
 */
export function buildReadingStatsSnapshot(
  works: Work[],
  readingMetaByWork: Map<string, LibraryUserReadingMeta>,
  workMetaByWork: Map<string, LibraryWorkMeta>,
  ownerScope: ReadingStatsOwnerScope,
): ReadingStatsSnapshot {
  const statusCounts: Record<UserReadingStatus, number> = {
    to_read: 0,
    ongoing: 0,
    completed: 0,
    abandoned: 0,
  };

  let volumesRead = 0;
  let volumesTotal = 0;
  let chaptersRead = 0;
  let chaptersTotal = 0;
  let ownedWorkCount = 0;

  const catalogWorks: ReadingWorkItem[] = [];

  for (const work of works) {
    const workMeta = workMetaByWork.get(work.id);
    const reading = readingMetaByWork.get(work.id);
    if (!reading) {
      continue;
    }

    if (workMatchesOwnerScope(workMeta, ownerScope)) {
      ownedWorkCount += 1;
    }

    statusCounts[reading.userReadingStatus] += 1;
    volumesRead += reading.volumesRead;
    volumesTotal += reading.volumesTotal;
    chaptersRead += reading.chaptersRead;
    chaptersTotal += reading.chaptersTotal;

    catalogWorks.push(toReadingWorkItem(work, reading));
  }

  const allWorks = [...catalogWorks].sort((a, b) =>
    a.title.localeCompare(b.title, "fr", { sensitivity: "base" }),
  );

  const recentWorks = catalogWorks
    .filter((item) => item.lastActivityAt != null)
    .sort((a, b) =>
      (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
    )
    .slice(0, 6);

  const ongoingWorks = catalogWorks
    .filter((item) => item.userReadingStatus === "ongoing")
    .sort((a, b) => b.progressPercent - a.progressPercent);

  return {
    libraryWorkCount: works.length,
    ownedWorkCount,
    statusCounts,
    volumesRead,
    volumesTotal,
    chaptersRead,
    chaptersTotal,
    allWorks,
    recentWorks,
    ongoingWorks,
  };
}
