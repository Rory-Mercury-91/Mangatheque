/** Types d'actions enregistrées dans le journal. */
export type ActivityActionType =
  | "work_delete"
  | "work_create"
  | "work_update"
  | "volume_delete"
  | "volume_create"
  | "volume_update"
  | "planning_volume_create"
  | "planning_volume_update";

/** Actions issues du sync planning Nautiljon. */
export const PLANNING_ACTIVITY_ACTIONS = [
  "planning_volume_create",
  "planning_volume_update",
] as const;

export type PlanningActivityAction = (typeof PLANNING_ACTIVITY_ACTIONS)[number];

/** Filtres d'action affichés dans l'UI (libellé « série »). */
export type ActivityLogFilterAction =
  | "series_create"
  | "volume_create"
  | "series_delete"
  | "volume_delete"
  | "planning_update";

/** Filtres de la page journal. */
export interface ActivityLogFiltersState {
  search: string;
  actionTypes: ActivityLogFilterAction[];
  userIds: string[];
}

export const DEFAULT_ACTIVITY_LOG_FILTERS: ActivityLogFiltersState = {
  search: "",
  actionTypes: [],
  userIds: [],
};

/** Nombre d'entrées affichées par page dans le journal (après agrégation). */
export const ACTIVITY_LOG_PAGE_SIZE = 25;

/** Entrée du journal d'activité. */
export interface ActivityLog {
  id: string;
  action_type: ActivityActionType | string;
  entity_type: string;
  entity_id: string | null;
  entity_title: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  user_id: string | null;
  user_email: string | null;
  restored_at: string | null;
  restored_by_user_id: string | null;
  restored_by_email: string | null;
  created_at: string;
}

/** Acteur d'une action (utilisateur connecté). */
export interface ActivityLogActor {
  userId: string;
  userEmail: string;
}

/** Snapshot d'une série supprimée, pour restauration. */
export interface WorkRestoreSnapshot {
  work: Record<string, unknown>;
  volumes: Array<Record<string, unknown>>;
  volumeOwners: Array<{
    volume_id: string;
    owner_id: string;
    has_mihon: boolean;
  }>;
}

/** Snapshot d'un tome supprimé, pour restauration. */
export interface VolumeRestoreSnapshot {
  volume: Record<string, unknown>;
  volumeOwners: Array<{
    volume_id: string;
    owner_id: string;
    has_mihon: boolean;
  }>;
  workId: string;
  workTitle: string;
}

/** Entrée affichée dans le journal (éventuellement agrégée). */
export interface ActivityLogViewEntry {
  id: string;
  log: ActivityLog;
  actionLabel: string;
  entityTitle: string | null;
  reason: string | null;
  createdAt: string;
  userEmail: string | null;
  actorLabel: string;
  workId: string | null;
  volumeCount: number | null;
  canRestore: boolean;
  isRestored: boolean;
  restoredByEmail: string | null;
  isPlanningUpdate: boolean;
}

/** Payload pour enregistrer une action. */
export interface LogActivityInput {
  actionType: ActivityActionType;
  entityType: string;
  entityId?: string | null;
  entityTitle?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}
