/** Fournisseur de tracker externe. */
export type TrackerProvider = "mal" | "anilist";

/** Compte tracker lié au compte auth courant. */
export interface UserTrackerAccount {
  provider: TrackerProvider;
  externalUserId: string | null;
  externalUsername: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

/** Progression distante normalisée. */
export interface TrackerRemoteProgress {
  provider: TrackerProvider;
  mediaId: number;
  chaptersRead: number | null;
  volumesRead: number | null;
  status: string | null;
}

/** Résultat d'une synchro tracker → lecture locale. */
export interface TrackerSyncResult {
  provider: TrackerProvider;
  workId: string;
  workTitle: string;
  chaptersApplied: number | null;
  volumesApplied: number | null;
  /** Total catalogue VF après sync (si relevé). */
  chapterVfTotal?: number | null;
  /** Valeur brute renvoyée par l'API (diagnostic). */
  remoteChapters?: number | null;
  skippedReason?: string;
}
