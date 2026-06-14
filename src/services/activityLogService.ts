import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  isPlanningActivityLog,
  resolveActivityActorLabel,
  resolveWorkIdFromLog,
} from "@/services/planningNotificationService";
import type {
  ActivityLog,
  ActivityLogActor,
  ActivityLogFilterAction,
  ActivityLogViewEntry,
  LogActivityInput,
  VolumeRestoreSnapshot,
  WorkRestoreSnapshot,
} from "@/types/activityLog";

const AGGREGATION_WINDOW_MS = 2 * 60 * 1000;

const FILTER_TO_DB_ACTIONS: Record<ActivityLogFilterAction, string[]> = {
  series_create: ["work_create"],
  volume_create: ["volume_create", "volume_update"],
  series_delete: ["work_delete"],
  volume_delete: ["volume_delete"],
  planning_update: ["planning_volume_create", "planning_volume_update"],
};

const ACTION_LABELS: Record<string, string> = {
  work_delete: "Suppression de série",
  work_create: "Création de série",
  work_update: "Modification de série",
  volume_delete: "Suppression de tome",
  volume_create: "Création de tome",
  volume_update: "Modification de tome",
  planning_volume_create: "Maj Nautiljon · nouveau tome",
  planning_volume_update: "Maj Nautiljon · tome mis à jour",
};

/**
 * @description Résout l'auteur enregistré sur une entrée du journal.
 * @param log - Entrée brute (colonnes ou metadata de secours).
 */
export function resolveLogActor(log: ActivityLog): {
  userId: string | null;
  userEmail: string | null;
} {
  const metadata = log.metadata ?? {};
  const userId =
    log.user_id ??
    (typeof metadata.actorUserId === "string" ? metadata.actorUserId : null);
  const userEmail =
    log.user_email ??
    (typeof metadata.actorEmail === "string" ? metadata.actorEmail : null);

  return { userId, userEmail };
}

/**
 * @description Résout l'utilisateur courant pour le journal.
 */
async function resolveCurrentActor(): Promise<{
  userId: string | null;
  userEmail: string | null;
}> {
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;
  if (sessionUser) {
    return {
      userId: sessionUser.id,
      userEmail: sessionUser.email ?? null,
    };
  }

  const { data } = await supabase.auth.getUser();
  return {
    userId: data.user?.id ?? null,
    userEmail: data.user?.email ?? null,
  };
}

/**
 * @description Enregistre une action dans le journal (suppression, création…).
 * @param input - Détails de l'action et justification éventuelle.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  const supabase = getSupabaseClient();
  const actor = await resolveCurrentActor();
  const metadata = {
    ...(input.metadata ?? {}),
    actorUserId: actor.userId,
    actorEmail: actor.userEmail,
  };

  const { error } = await supabase.from("activity_logs").insert({
    action_type: input.actionType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_title: input.entityTitle ?? null,
    reason: input.reason ?? null,
    metadata,
    user_id: actor.userId,
    user_email: actor.userEmail,
  });

  if (error) {
    console.error("Impossible d'enregistrer le journal :", error.message);
  }
}

/**
 * @description Capture l'état complet d'une série avant suppression.
 * @param workId - Identifiant de la série.
 */
export async function captureWorkDeleteSnapshot(
  workId: string,
): Promise<WorkRestoreSnapshot> {
  const supabase = getSupabaseClient();

  const { data: work, error: workError } = await supabase
    .from("works")
    .select("*")
    .eq("id", workId)
    .single();

  if (workError || !work) {
    throw new Error(
      `Impossible de sauvegarder la série : ${workError?.message ?? workId}`,
    );
  }

  const { data: volumes, error: volumeError } = await supabase
    .from("volumes")
    .select("*")
    .eq("work_id", workId)
    .order("volume_number");

  if (volumeError) {
    throw new Error(
      `Impossible de sauvegarder les tomes : ${volumeError.message}`,
    );
  }

  const volumeIds = (volumes ?? []).map((row) => row.id as string);
  let volumeOwners: WorkRestoreSnapshot["volumeOwners"] = [];

  if (volumeIds.length > 0) {
    const { data: ownerLinks, error: ownerError } = await supabase
      .from("volume_owners")
      .select("volume_id, owner_id, has_mihon")
      .in("volume_id", volumeIds);

    if (ownerError) {
      throw new Error(
        `Impossible de sauvegarder les propriétaires : ${ownerError.message}`,
      );
    }

    volumeOwners = (ownerLinks ?? []).map((link) => ({
      volume_id: link.volume_id as string,
      owner_id: link.owner_id as string,
      has_mihon: link.has_mihon as boolean,
    }));
  }

  return {
    work: work as Record<string, unknown>,
    volumes: (volumes ?? []) as Array<Record<string, unknown>>,
    volumeOwners,
  };
}

export interface FetchActivityLogsParams {
  search?: string;
  actionTypes?: ActivityLogFilterAction[];
  userIds?: string[];
}

/**
 * @description Charge les entrées du journal, les plus récentes en premier.
 * @param params - Filtres optionnels côté serveur.
 */
export async function fetchActivityLogs(
  params?: FetchActivityLogsParams,
): Promise<ActivityLog[]> {
  const supabase = getSupabaseClient();
  let query = supabase.from("activity_logs").select("*");

  const search = params?.search?.trim();
  if (search) {
    query = query.ilike("entity_title", `%${search}%`);
  }

  const dbActionTypes = (params?.actionTypes ?? []).flatMap(
    (filter) => FILTER_TO_DB_ACTIONS[filter] ?? [],
  );
  if (dbActionTypes.length > 0) {
    query = query.in("action_type", dbActionTypes);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Impossible de charger le journal : ${error.message}`);
  }

  let logs = (data ?? []) as ActivityLog[];

  if (params?.userIds?.length) {
    const allowed = new Set(params.userIds);
    logs = logs.filter((log) => {
      if (isPlanningActivityLog(log)) {
        return true;
      }
      const actor = resolveLogActor(log);
      const actorKey =
        actor.userId ?? (actor.userEmail ? `email:${actor.userEmail}` : null);
      return actorKey ? allowed.has(actorKey) : false;
    });
  }

  return logs;
}

/**
 * @description Extrait la liste des auteurs à partir d'entrées du journal.
 * @param logs - Entrées brutes du journal.
 */
export function collectActivityLogActors(
  logs: ActivityLog[],
): ActivityLogActor[] {
  const byId = new Map<string, ActivityLogActor>();

  for (const log of logs) {
    const actor = resolveLogActor(log);
    if (!actor.userEmail) {
      continue;
    }

    const userId = actor.userId ?? `email:${actor.userEmail}`;
    if (byId.has(userId)) {
      continue;
    }

    byId.set(userId, { userId, userEmail: actor.userEmail });
  }

  return [...byId.values()].sort((a, b) =>
    a.userEmail.localeCompare(b.userEmail, "fr"),
  );
}

/**
 * @description Liste tous les comptes du foyer (table profiles).
 */
export async function fetchHouseholdAccounts(): Promise<ActivityLogActor[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .order("email");

  if (error) {
    console.error(
      "Impossible de charger les comptes du foyer :",
      error.message,
    );
    return [];
  }

  return (data ?? []).map((row) => ({
    userId: row.id as string,
    userEmail: row.email as string,
  }));
}

/**
 * @description Fusionne comptes du foyer et auteurs issus du journal.
 * @param logActors - Auteurs détectés dans les entrées du journal.
 * @param householdAccounts - Tous les comptes inscrits (avec ou sans action).
 */
export function mergeActivityLogActors(
  logActors: ActivityLogActor[],
  householdAccounts: ActivityLogActor[],
): ActivityLogActor[] {
  const byId = new Map<string, ActivityLogActor>();

  for (const actor of [...householdAccounts, ...logActors]) {
    if (!actor.userEmail) {
      continue;
    }
    const userId = actor.userId || `email:${actor.userEmail}`;
    byId.set(userId, { userId, userEmail: actor.userEmail });
  }

  return [...byId.values()].sort((a, b) =>
    a.userEmail.localeCompare(b.userEmail, "fr"),
  );
}

/**
 * @description Transforme les logs bruts en entrées affichables (agrégation import).
 * @param logs - Logs triés du plus récent au plus ancien.
 */
export function buildActivityLogViewEntries(
  logs: ActivityLog[],
): ActivityLogViewEntry[] {
  const sorted = [...logs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const workCreatesByWorkId = new Map<string, ActivityLog>();
  for (const log of sorted) {
    if (log.action_type === "work_create" && log.entity_id) {
      workCreatesByWorkId.set(log.entity_id, log);
    }
  }

  const consumedVolumeCreates = new Set<string>();
  for (const log of sorted) {
    if (log.action_type !== "volume_create") {
      continue;
    }

    const workId = log.metadata?.workId as string | undefined;
    if (!workId) {
      continue;
    }

    const workCreate = workCreatesByWorkId.get(workId);
    if (!workCreate) {
      continue;
    }

    const delta =
      new Date(workCreate.created_at).getTime() -
      new Date(log.created_at).getTime();
    if (Math.abs(delta) <= AGGREGATION_WINDOW_MS) {
      consumedVolumeCreates.add(log.id);
    }
  }

  return sorted
    .filter((log) => !consumedVolumeCreates.has(log.id))
    .map((log) => toViewEntry(log));
}

/**
 * @description Restaure une série ou un tome depuis une entrée de suppression.
 * @param logId - Identifiant de l'entrée journal.
 */
export async function restoreFromActivityLog(logId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: log, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("id", logId)
    .single();

  if (error || !log) {
    throw new Error(`Entrée introuvable : ${error?.message ?? logId}`);
  }

  const entry = log as ActivityLog;
  if (entry.restored_at) {
    throw new Error("Cette entrée a déjà été restaurée.");
  }

  if (entry.action_type === "work_delete") {
    await restoreWorkSnapshot(entry);
  } else if (entry.action_type === "volume_delete") {
    await restoreVolumeSnapshot(entry);
  } else {
    throw new Error("Cette action ne peut pas être restaurée.");
  }

  const actor = await resolveCurrentActor();
  const { error: updateError } = await supabase
    .from("activity_logs")
    .update({
      restored_at: new Date().toISOString(),
      restored_by_user_id: actor.userId,
      restored_by_email: actor.userEmail,
    })
    .eq("id", logId);

  if (updateError) {
    throw new Error(
      `Restauration effectuée mais marquage impossible : ${updateError.message}`,
    );
  }
}

function toViewEntry(log: ActivityLog): ActivityLogViewEntry {
  const volumeCount = resolveVolumeCount(log);
  const actionLabel = formatActionLabel(log);
  const hasSnapshot = Boolean(log.metadata?.snapshot);
  const isDeletion =
    log.action_type === "work_delete" || log.action_type === "volume_delete";
  const isPlanningUpdate = isPlanningActivityLog(log);
  const actor = resolveLogActor(log);

  return {
    id: log.id,
    log,
    actionLabel,
    entityTitle: log.entity_title,
    reason: log.reason,
    createdAt: log.created_at,
    userEmail: actor.userEmail,
    actorLabel: resolveActivityActorLabel(log),
    workId: resolveWorkIdFromLog(log),
    volumeCount,
    canRestore: isDeletion && hasSnapshot && !log.restored_at,
    isRestored: Boolean(log.restored_at),
    restoredByEmail: resolveRestoredByEmail(log),
    isPlanningUpdate,
  };
}

function resolveRestoredByEmail(log: ActivityLog): string | null {
  if (!log.restored_at) {
    return null;
  }
  const metadata = log.metadata ?? {};
  return (
    log.restored_by_email ??
    (typeof metadata.restoredByEmail === "string"
      ? metadata.restoredByEmail
      : null)
  );
}

function resolveVolumeCount(log: ActivityLog): number | null {
  if (log.action_type === "work_create") {
    const count = log.metadata?.volumeCount;
    return typeof count === "number" && count > 0 ? count : null;
  }

  if (log.action_type === "volume_create") {
    return 1;
  }

  return null;
}

function formatActionLabel(log: ActivityLog): string {
  const volumeCount = resolveVolumeCount(log);
  const base = ACTION_LABELS[log.action_type] ?? log.action_type;

  if (log.action_type === "work_create" && volumeCount && volumeCount > 0) {
    return `${base} · ${volumeCount} tome${volumeCount > 1 ? "s" : ""}`;
  }

  if (isPlanningActivityLog(log)) {
    const volumeNumber = log.metadata?.volumeNumber;
    if (typeof volumeNumber === "number") {
      const verb =
        log.action_type === "planning_volume_create" ? "ajouté" : "mis à jour";
      return `Maj Nautiljon · Tome ${volumeNumber} ${verb}`;
    }
    return base;
  }

  return base;
}

async function restoreWorkSnapshot(log: ActivityLog): Promise<void> {
  const snapshot = log.metadata?.snapshot as WorkRestoreSnapshot | undefined;
  if (!snapshot?.work) {
    throw new Error("Aucune sauvegarde disponible pour cette suppression.");
  }

  const supabase = getSupabaseClient();
  const workId = snapshot.work.id as string | undefined;
  if (!workId) {
    throw new Error("Sauvegarde invalide (identifiant série manquant).");
  }

  const { data: existing } = await supabase
    .from("works")
    .select("id")
    .eq("id", workId)
    .maybeSingle();

  if (existing) {
    throw new Error("Cette série existe déjà dans la bibliothèque.");
  }

  const { error: workError } = await supabase
    .from("works")
    .insert(snapshot.work);

  if (workError) {
    throw new Error(`Restauration de la série impossible : ${workError.message}`);
  }

  if (snapshot.volumes.length > 0) {
    const { error: volumeError } = await supabase
      .from("volumes")
      .insert(snapshot.volumes);

    if (volumeError) {
      await supabase.from("works").delete().eq("id", workId);
      throw new Error(`Restauration des tomes impossible : ${volumeError.message}`);
    }
  }

  if (snapshot.volumeOwners.length > 0) {
    const { error: ownerError } = await supabase
      .from("volume_owners")
      .insert(snapshot.volumeOwners);

    if (ownerError) {
      await supabase.from("works").delete().eq("id", workId);
      throw new Error(
        `Restauration des propriétaires impossible : ${ownerError.message}`,
      );
    }
  }
}

async function restoreVolumeSnapshot(log: ActivityLog): Promise<void> {
  const snapshot = log.metadata?.snapshot as VolumeRestoreSnapshot | undefined;
  if (!snapshot?.volume) {
    throw new Error("Aucune sauvegarde disponible pour ce tome.");
  }

  const supabase = getSupabaseClient();
  const volumeId = snapshot.volume.id as string | undefined;
  const workId = snapshot.workId;

  if (!volumeId || !workId) {
    throw new Error("Sauvegarde invalide (identifiants manquants).");
  }

  const { data: work } = await supabase
    .from("works")
    .select("id")
    .eq("id", workId)
    .maybeSingle();

  if (!work) {
    throw new Error(
      "La série parente n'existe plus. Restaurez d'abord la série supprimée.",
    );
  }

  const { data: existingVolume } = await supabase
    .from("volumes")
    .select("id")
    .eq("id", volumeId)
    .maybeSingle();

  if (existingVolume) {
    throw new Error("Ce tome existe déjà dans la bibliothèque.");
  }

  const { error: volumeError } = await supabase
    .from("volumes")
    .insert(snapshot.volume);

  if (volumeError) {
    throw new Error(`Restauration du tome impossible : ${volumeError.message}`);
  }

  if (snapshot.volumeOwners.length > 0) {
    const { error: ownerError } = await supabase
      .from("volume_owners")
      .insert(snapshot.volumeOwners);

    if (ownerError) {
      await supabase.from("volumes").delete().eq("id", volumeId);
      throw new Error(
        `Restauration des propriétaires impossible : ${ownerError.message}`,
      );
    }
  }
}
