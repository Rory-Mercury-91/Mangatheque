/** Types d'actions enregistrées dans le journal. */
export type ActivityActionType =
  | "work_delete"
  | "work_create"
  | "work_update";

/** Entrée du journal d'activité. */
export interface ActivityLog {
  id: string;
  action_type: ActivityActionType | string;
  entity_type: string;
  entity_id: string | null;
  entity_title: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
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
