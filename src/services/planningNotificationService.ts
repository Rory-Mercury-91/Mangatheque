import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  LIBRARY_UPDATE_ACTIVITY_ACTIONS,
  PLANNING_ACTIVITY_ACTIONS,
  RELEASE_ACTIVITY_ACTIONS,
  type ActivityLog,
  type LibraryUpdateActivityAction,
  type PlanningActivityAction,
  type ReleaseActivityAction,
} from "@/types/activityLog";
import { formatDateFr } from "@/utils/dateFormat";

export interface PlanningNotification {
  id: string;
  workId: string;
  workTitle: string;
  volumeNumber: number | null;
  chapterLabel: string | null;
  releaseDate: string | null;
  actionType: LibraryUpdateActivityAction;
  label: string;
  createdAt: string;
  kind: "planning" | "release";
}

const LIBRARY_UPDATE_ACTION_SET = new Set<string>(
  LIBRARY_UPDATE_ACTIVITY_ACTIONS,
);
const PLANNING_ACTION_SET = new Set<string>(PLANNING_ACTIVITY_ACTIONS);
const RELEASE_ACTION_SET = new Set<string>(RELEASE_ACTIVITY_ACTIONS);

/**
 * @description Indique si une entrée journal provient du sync planning Nautiljon.
 */
export function isPlanningActivityLog(log: ActivityLog): boolean {
  return PLANNING_ACTION_SET.has(log.action_type);
}

/**
 * @description Indique si une entrée journal vient du rattrapage de parution.
 */
export function isReleaseActivityLog(log: ActivityLog): boolean {
  return RELEASE_ACTION_SET.has(log.action_type);
}

/**
 * @description Indique si l'entrée doit apparaître dans la cloche mises à jour.
 */
export function isLibraryUpdateActivityLog(log: ActivityLog): boolean {
  return LIBRARY_UPDATE_ACTION_SET.has(log.action_type);
}

/**
 * @description Résout l'identifiant série d'une entrée journal.
 */
export function resolveWorkIdFromLog(log: ActivityLog): string | null {
  if (log.entity_type === "work" && log.entity_id) {
    return log.entity_id;
  }

  const workId = log.metadata?.workId;
  return typeof workId === "string" ? workId : null;
}

/**
 * @description Libellé auteur pour le journal (Nautiljon, parution ou utilisateur).
 */
export function resolveActivityActorLabel(log: ActivityLog): string {
  if (isPlanningActivityLog(log)) {
    return "Nautiljon (planning)";
  }
  if (isReleaseActivityLog(log)) {
    return "Parution plateforme";
  }

  const email = log.user_email;
  if (email) {
    return email;
  }

  return "Utilisateur inconnu";
}

/**
 * @description Charge les notifications planning + parution récentes.
 */
export async function fetchPlanningNotifications(
  limit = 20,
): Promise<PlanningNotification[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .in("action_type", [...LIBRARY_UPDATE_ACTIVITY_ACTIONS])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Impossible de charger les notifications : ${error.message}`,
    );
  }

  return (data ?? [])
    .map((row) => toPlanningNotification(row as ActivityLog))
    .filter((item): item is PlanningNotification => item !== null);
}

/**
 * @description Compte les notifications non lues pour l'utilisateur courant.
 */
export async function fetchUnreadPlanningCount(): Promise<number> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return 0;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("planning_seen_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Profil planning :", profileError.message);
    return 0;
  }

  let query = supabase
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .in("action_type", [...LIBRARY_UPDATE_ACTIVITY_ACTIONS]);

  if (profile?.planning_seen_at) {
    query = query.gt("created_at", profile.planning_seen_at);
  }

  const { count, error } = await query;
  if (error) {
    console.error("Compteur planning :", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * @description Marque toutes les notifications planning / parution comme lues.
 */
export async function markPlanningNotificationsSeen(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ planning_seen_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    throw new Error(`Impossible de marquer les notifications lues : ${error.message}`);
  }
}

function toPlanningNotification(log: ActivityLog): PlanningNotification | null {
  const workId = resolveWorkIdFromLog(log);
  if (!workId) {
    return null;
  }

  const metadata = log.metadata ?? {};
  const workTitle =
    log.entity_title?.replace(/\s*—\s*Tome\s+\d+\s*$/i, "").trim() ??
    "Série";

  if (isReleaseActivityLog(log)) {
    const chapterLabel =
      typeof metadata.chapterLabel === "string"
        ? metadata.chapterLabel
        : Array.isArray(metadata.releasedChapters) &&
            metadata.releasedChapters.length > 0
          ? String(
              metadata.releasedChapters[metadata.releasedChapters.length - 1],
            )
          : null;
    const releasedCount = Array.isArray(metadata.releasedChapters)
      ? metadata.releasedChapters.length
      : 1;
    const label = chapterLabel
      ? releasedCount > 1
        ? `${releasedCount} chapitres parus (jusqu’au ${chapterLabel})`
        : `Chapitre ${chapterLabel} paru`
      : "Nouveau chapitre paru";
    const withPause =
      metadata.reachedCeiling === true ||
      metadata.scheduleStatus === "season_pause"
        ? `${label} · passage en pause de saison`
        : label;

    return {
      id: log.id,
      workId,
      workTitle,
      volumeNumber: null,
      chapterLabel,
      releaseDate:
        typeof metadata.dateNextRelease === "string"
          ? metadata.dateNextRelease
          : null,
      actionType: log.action_type as ReleaseActivityAction,
      label: withPause,
      createdAt: log.created_at,
      kind: "release",
    };
  }

  const volumeNumber =
    typeof metadata.volumeNumber === "number" ? metadata.volumeNumber : null;
  if (volumeNumber === null) {
    return null;
  }

  const releaseDate =
    typeof metadata.releaseDate === "string" ? metadata.releaseDate : null;
  const actionType = log.action_type as PlanningActivityAction;
  const releaseLabel = releaseDate
    ? ` · sortie ${formatDateFr(releaseDate)}`
    : "";

  const label =
    actionType === "planning_volume_create"
      ? `Tome ${volumeNumber} ajouté${releaseLabel}`
      : `Tome ${volumeNumber} mis à jour${releaseLabel}`;

  return {
    id: log.id,
    workId,
    workTitle,
    volumeNumber,
    chapterLabel: null,
    releaseDate,
    actionType,
    label,
    createdAt: log.created_at,
    kind: "planning",
  };
}
