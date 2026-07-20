import type { UserReadingStatus } from "@/constants/userReadingStatus";

/** Portée propriétaire pour les statistiques de lecture. */
export type ReadingStatsOwnerScope = "all" | string;

/** Ligne série pour listes et carrousel du suivi de lecture. */
export interface ReadingWorkItem {
  workId: string;
  title: string;
  coverUrl: string | null;
  userReadingStatus: UserReadingStatus;
  volumesRead: number;
  volumesTotal: number;
  chaptersRead: number;
  chaptersTotal: number;
  progressPercent: number;
  lastActivityAt: string | null;
}

/** Agrégat affiché sur la page suivi de lecture. */
export interface ReadingStatsSnapshot {
  libraryWorkCount: number;
  ownedWorkCount: number;
  statusCounts: Record<UserReadingStatus, number>;
  volumesRead: number;
  volumesTotal: number;
  chaptersRead: number;
  chaptersTotal: number;
  /** Toutes les séries du filtre (export historique, listes). */
  allWorks: ReadingWorkItem[];
  recentWorks: ReadingWorkItem[];
  ongoingWorks: ReadingWorkItem[];
}
