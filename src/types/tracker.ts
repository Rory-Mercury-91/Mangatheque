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
  /** Progression liste perso (si chargée avec la liste). */
  progress?: TrackerRemoteProgress | null;
}

/** Progression d'une sync tracker (barre d'avancement UI). */
export interface TrackerSyncProgress {
  current: number;
  total: number;
  /** Libellé de l'étape / entrée en cours. */
  label: string;
  /** Créations de fiches (sync anime). */
  createdCount?: number;
  phase?: "loading" | "syncing" | "done";
}

/** Callback d'avancement sync. */
export type TrackerSyncProgressCallback = (
  progress: TrackerSyncProgress,
) => void;

/** Compteur comparé entre l'app et le tracker. */
export type TrackerSyncField = "chapters" | "volumes";

/** Décision de merge pour un compteur. */
export type TrackerSyncDecisionKind = "none" | "pull" | "push" | "conflict";

/** Décision pour chapitres ou tomes d'une série. */
export interface TrackerFieldSyncDecision {
  field: TrackerSyncField;
  kind: TrackerSyncDecisionKind;
  local: number;
  remote: number;
  /** True si l'écart a déjà été appliqué / signalé (texte renforcé). */
  repeated: boolean;
}

/** Origine d'un rapport de sync manga. */
export type TrackerSyncReportSource = "manual" | "startup" | "oauth";

/** Rapport consultable après une sync (sans s'ouvrir tout seul). */
export interface TrackerSyncReport {
  at: string;
  source: TrackerSyncReportSource;
  pulled: number;
  pushed: number;
  conflicts: TrackerSyncConflictItem[];
  results: TrackerSyncResult[];
}

/** Conflit à trancher : garder l'app ou le tracker. */
export interface TrackerSyncConflictItem {
  workId: string;
  workTitle: string;
  field: TrackerSyncField;
  local: number;
  remote: number;
  repeated: boolean;
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
  chapterDecision?: TrackerFieldSyncDecision;
  volumeDecision?: TrackerFieldSyncDecision;
}
