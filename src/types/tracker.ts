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
  /** Horodatage de mise à jour (ms epoch), pour départager les sources. */
  updatedAtMs: number | null;
}

/** Entrée manga de la liste personnelle d'un tracker (pour le picker). */
export interface TrackerMangaListEntry {
  provider: TrackerProvider;
  /** ID sur le provider de la liste. */
  mediaId: number;
  /** MAL ID croisé si connu (AniList le fournit souvent). */
  malId: number | null;
  /** AniList ID croisé si connu. */
  anilistId: number | null;
  /** Titre d'affichage. */
  title: string;
  /** Titres + synonymes pour le filtre local. */
  searchTitles: string[];
}

/** Résultat d'une synchro tracker ↔ lecture locale. */
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
  /** Trackers mis à jour en écriture (push). */
  pushedProviders?: TrackerProvider[];
  /** Erreurs de push (création / alignement). */
  pushErrors?: string[];
  skippedReason?: string;
}
