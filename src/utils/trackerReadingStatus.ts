import type { TrackerProvider, TrackerRemoteProgress } from "@/types/tracker";

/** Statut de liste manga normalisé (MAL + AniList). */
export type TrackerListStatusKind =
  | "reading"
  | "completed"
  | "on_hold"
  | "dropped"
  | "plan_to_read"
  | "repeating";

/**
 * @description Normalise un statut tracker (espaces, casse, tirets).
 * @param status - Statut brut MAL / AniList / Mihon.
 */
function normalizeStatusKey(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * @description Classe un statut de liste manga tracker.
 * @param status - Statut brut (`plan_to_read`, `PLANNING`, `CURRENT`…).
 */
export function classifyTrackerListStatus(
  status: string | null | undefined,
): TrackerListStatusKind | null {
  const key = normalizeStatusKey(status);
  if (!key) {
    return null;
  }
  if (key === "plan_to_read" || key === "plantoread" || key === "planning") {
    return "plan_to_read";
  }
  if (key === "reading" || key === "current" || key === "watching") {
    return "reading";
  }
  if (key === "completed" || key === "complete") {
    return "completed";
  }
  if (key === "on_hold" || key === "onhold" || key === "paused" || key === "pause") {
    return "on_hold";
  }
  if (key === "dropped") {
    return "dropped";
  }
  if (key === "repeating" || key === "rereading") {
    return "repeating";
  }
  return null;
}

/**
 * @description True si le statut tracker signifie « à lire » (non commencé).
 * MAL : `plan_to_read` ; AniList : `PLANNING`.
 * @param status - Statut brut de l'entrée de liste.
 */
export function isTrackerPlanToReadStatus(
  status: string | null | undefined,
): boolean {
  return classifyTrackerListStatus(status) === "plan_to_read";
}

/**
 * @description True si deux statuts de liste représentent la même intention.
 * @param left - Statut brut (tracker A).
 * @param right - Statut brut (tracker B ou cible de sync).
 */
export function areTrackerListStatusesEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = classifyTrackerListStatus(left);
  const b = classifyTrackerListStatus(right);
  if (a == null && b == null) {
    return true;
  }
  return a != null && a === b;
}

/**
 * @description Mappe un statut vers la valeur attendue par l'API cible.
 * MAL n'a pas « repeating » : repli sur `reading`.
 * @param status - Statut brut du gagnant de sync.
 * @param provider - Tracker de destination.
 */
export function mapTrackerStatusForProvider(
  status: string | null | undefined,
  provider: TrackerProvider,
): string | null {
  const kind = classifyTrackerListStatus(status);
  if (!kind) {
    return null;
  }
  if (provider === "mal") {
    switch (kind) {
      case "reading":
      case "repeating":
        return "reading";
      case "completed":
        return "completed";
      case "on_hold":
        return "on_hold";
      case "dropped":
        return "dropped";
      case "plan_to_read":
        return "plan_to_read";
    }
  }
  switch (kind) {
    case "reading":
      return "CURRENT";
    case "completed":
      return "COMPLETED";
    case "on_hold":
      return "PAUSED";
    case "dropped":
      return "DROPPED";
    case "plan_to_read":
      return "PLANNING";
    case "repeating":
      return "REPEATING";
  }
}

/**
 * @description « À lire » = non lu : ignore les compteurs restants MAL/AniList.
 * Un statut PLANNING / plan_to_read avec des chapitres/tomes reliquats ne doit
 * jamais marquer la série comme lue localement.
 * @param remote - Progression brute renvoyée par l'API.
 */
export function normalizeTrackerRemoteProgress(
  remote: TrackerRemoteProgress,
): TrackerRemoteProgress {
  if (!isTrackerPlanToReadStatus(remote.status)) {
    return remote;
  }
  return {
    ...remote,
    chaptersRead: 0,
    volumesRead: 0,
  };
}

/**
 * @description True si le tracking Mihon est « à lire » (non commencé).
 * MAL `syncId` 1 → statut 6 ; AniList `syncId` 2 → statut 2.
 * @param syncId - Identifiant du tracker Mihon.
 * @param status - Code statut Mihon.
 */
export function isMihonTrackerPlanToRead(
  syncId: number | null | undefined,
  status: number | null | undefined,
): boolean {
  const sync = Number(syncId ?? 0);
  const code = Number(status ?? 0);
  if (!Number.isFinite(sync) || !Number.isFinite(code)) {
    return false;
  }
  if (sync === 1) {
    return code === 6;
  }
  if (sync === 2) {
    return code === 2;
  }
  return false;
}

/**
 * @description Max de nombres nullable.
 */
function maxNullable(values: Array<number | null | undefined>): number | null {
  let max: number | null = null;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) {
      continue;
    }
    max = max == null ? value : Math.max(max, value);
  }
  return max;
}

/**
 * @description Choisit la progression API la plus récente ; sans horodatage, max des valeurs.
 */
function pickLatestRemoteProgress(
  remotes: TrackerRemoteProgress[],
): TrackerRemoteProgress | null {
  const usable = remotes.filter(
    (remote) =>
      remote.chaptersRead != null ||
      remote.volumesRead != null ||
      isTrackerPlanToReadStatus(remote.status),
  );
  if (usable.length === 0) {
    return null;
  }

  const dated = usable.filter((remote) => remote.updatedAtMs != null);
  if (dated.length > 0) {
    return dated.reduce((best, current) =>
      (current.updatedAtMs ?? 0) >= (best.updatedAtMs ?? 0) ? current : best,
    );
  }

  const planning = usable.find((remote) =>
    isTrackerPlanToReadStatus(remote.status),
  );
  if (planning) {
    return planning;
  }

  return {
    provider: usable[0]!.provider,
    mediaId: usable[0]!.mediaId,
    chaptersRead: maxNullable(usable.map((s) => s.chaptersRead)),
    volumesRead: maxNullable(usable.map((s) => s.volumesRead)),
    status: usable.find((s) => s.status)?.status ?? null,
    updatedAtMs: null,
  };
}

/**
 * @description Choisit la progression à appliquer en local.
 * Un tracker « à lire » (MAL plan_to_read / AniList PLANNING) n'est jamais
 * écrasé par l'autre tracker (ex. AniList 49/49 vs MAL 0/49).
 * @param remotes - Progressions brutes MAL / AniList du compte connecté.
 */
export function pickTrackerSyncWinner(
  remotes: TrackerRemoteProgress[],
): TrackerRemoteProgress | null {
  if (remotes.length === 0) {
    return null;
  }
  const normalized = remotes.map(normalizeTrackerRemoteProgress);
  const planning = normalized.filter((remote) =>
    isTrackerPlanToReadStatus(remote.status),
  );
  if (planning.length > 0) {
    return pickLatestRemoteProgress(planning);
  }
  return pickLatestRemoteProgress(normalized);
}

/**
 * @description True si le tracker distant doit être aligné sur la cible.
 * Ne pousse jamais une progression réelle sur une entrée « à lire ».
 * Ne « dés-complète » pas l'autre tracker depuis un veto « à lire ».
 */
export function trackerNeedsProgressPush(params: {
  remote: TrackerRemoteProgress | undefined;
  onList: boolean;
  targetChapters: number | null;
  targetVolumes: number | null;
  targetStatus: string | null;
}): boolean {
  const {
    remote,
    onList,
    targetChapters,
    targetVolumes,
    targetStatus,
  } = params;
  const targetPlanning = isTrackerPlanToReadStatus(targetStatus);
  const remotePlanning = isTrackerPlanToReadStatus(remote?.status);

  if (targetChapters == null && targetVolumes == null && !targetStatus) {
    return false;
  }

  if (!onList || !remote) {
    if (targetPlanning) {
      return false;
    }
    return (
      (targetChapters != null && targetChapters > 0) ||
      (targetVolumes != null && targetVolumes > 0)
    );
  }

  if (remotePlanning && !targetPlanning) {
    return false;
  }
  if (targetPlanning && !remotePlanning) {
    return false;
  }

  if (
    targetChapters != null &&
    targetChapters !== (remote.chaptersRead ?? 0)
  ) {
    return true;
  }
  if (
    targetVolumes != null &&
    targetVolumes !== (remote.volumesRead ?? 0)
  ) {
    return true;
  }
  if (
    targetStatus &&
    !areTrackerListStatusesEquivalent(remote.status, targetStatus)
  ) {
    return true;
  }
  return false;
}
