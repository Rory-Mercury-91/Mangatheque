import type {
  TrackerFieldSyncDecision,
  TrackerRemoteProgress,
  TrackerSyncDecisionKind,
  TrackerSyncField,
} from "@/types/tracker";

/** Mémoire d'un compteur pour détecter un pull déjà appliqué puis annulé. */
export interface TrackerFieldSyncMemory {
  autoPulledRemote: number | null;
  rejectedRemote: number | null;
  conflictShows: number;
}

/**
 * @description True si le compteur est vide (non commencé).
 */
export function isEmptyTrackerCount(value: number): boolean {
  return !Number.isFinite(value) || value <= 0;
}

/**
 * @description Max des compteurs distants (vide = 0).
 * Un tracker à 49 et l'autre à 0 → 49 (le rempli l'emporte).
 */
export function pickTrackerSideCounts(remotes: TrackerRemoteProgress[]): {
  chapters: number;
  volumes: number;
  status: string | null;
} {
  if (remotes.length === 0) {
    return { chapters: 0, volumes: 0, status: null };
  }
  let chapters = 0;
  let volumes = 0;
  for (const remote of remotes) {
    if (remote.chaptersRead != null && remote.chaptersRead > chapters) {
      chapters = remote.chaptersRead;
    }
    if (remote.volumesRead != null && remote.volumesRead > volumes) {
      volumes = remote.volumesRead;
    }
  }
  const dated = remotes.filter((remote) => remote.updatedAtMs != null);
  const pool = dated.length > 0 ? dated : remotes;
  const best = pool.reduce((acc, current) =>
    (current.updatedAtMs ?? 0) >= (acc.updatedAtMs ?? 0) ? current : acc,
  );
  return { chapters, volumes, status: best.status ?? null };
}

/**
 * @description Décide pull / push / conflit / rien pour un compteur.
 * Vide vs rempli → aligner. Deux valeurs > 0 différentes → conflit.
 * Si un pull a déjà été appliqué puis remis à 0 : conflit (répété).
 */
export function decideTrackerFieldSync(params: {
  field: TrackerSyncField;
  local: number;
  remote: number;
  memory?: TrackerFieldSyncMemory | null;
}): TrackerFieldSyncDecision {
  const local = Math.max(0, Math.floor(params.local));
  const remote = Math.max(0, Math.floor(params.remote));
  const memory = params.memory;
  const autoPulled = memory?.autoPulledRemote ?? null;
  const rejected = memory?.rejectedRemote ?? null;
  const shows = memory?.conflictShows ?? 0;

  if (local === remote) {
    return {
      field: params.field,
      kind: "none",
      local,
      remote,
      repeated: false,
    };
  }

  const localEmpty = isEmptyTrackerCount(local);
  const remoteEmpty = isEmptyTrackerCount(remote);

  if (localEmpty && !remoteEmpty) {
    const alreadyTried =
      autoPulled === remote || rejected === remote || autoPulled != null;
    if (alreadyTried) {
      return {
        field: params.field,
        kind: "conflict",
        local,
        remote,
        repeated: true,
      };
    }
    return {
      field: params.field,
      kind: "pull",
      local,
      remote,
      repeated: false,
    };
  }

  if (remoteEmpty && !localEmpty) {
    return {
      field: params.field,
      kind: "push",
      local,
      remote,
      repeated: false,
    };
  }

  return {
    field: params.field,
    kind: "conflict",
    local,
    remote,
    repeated: shows >= 2,
  };
}

/**
 * @description Cible à pousser : null si conflit (on n'écrase pas ce compteur).
 */
export function targetCountForPush(
  decision: TrackerFieldSyncDecision,
): number | null {
  switch (decision.kind) {
    case "pull":
      return decision.remote;
    case "push":
    case "none":
      return decision.local;
    case "conflict":
      return null;
    default: {
      const _exhaustive: never = decision.kind;
      return _exhaustive;
    }
  }
}

/**
 * @description Statut liste à envoyer selon la cible poussée.
 */
export function statusForPushedProgress(
  chapters: number | null,
  volumes: number | null,
): string | null {
  const chapterCount = chapters ?? 0;
  const volumeCount = volumes ?? 0;
  if (chapterCount > 0 || volumeCount > 0) {
    return "reading";
  }
  if (chapters === 0 || volumes === 0) {
    return "plan_to_read";
  }
  return null;
}

/**
 * @description Statut à pousser après un merge. Un conflit non tranché
 * ne doit pas faire basculer la liste en « à lire ».
 */
export function statusForSyncDecisions(
  chapterDecision: TrackerFieldSyncDecision | null,
  volumeDecision: TrackerFieldSyncDecision | null,
): string | null {
  if (
    chapterDecision?.kind === "conflict" ||
    volumeDecision?.kind === "conflict"
  ) {
    return null;
  }
  return statusForPushedProgress(
    chapterDecision ? targetCountForPush(chapterDecision) : null,
    volumeDecision ? targetCountForPush(volumeDecision) : null,
  );
}

export type { TrackerSyncDecisionKind };
