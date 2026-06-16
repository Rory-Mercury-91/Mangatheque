import { ExternalLink, Loader2, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import {
  resolveActivityLogActorDisplay,
  resolveLinkedUserDisplayLabel,
  type ActivityLogActorDisplay,
  type LinkedOwnerProfile,
} from "@/utils/activityLogActorDisplay";
import type { ActivityLogViewEntry } from "@/types/activityLog";
import { formatDateTimeFr } from "@/utils/dateFormat";
import "./ActivityLogEntryRow.css";

export interface ActivityLogEntryRowProps {
  entry: ActivityLogViewEntry;
  ownerByUserId: Map<string, LinkedOwnerProfile>;
  restoring: boolean;
  onRestore: () => void;
  onOpenWork: (workId: string) => void;
}

/**
 * @description Ligne compacte d'une entrée du journal d'activité.
 */
export function ActivityLogEntryRow({
  entry,
  ownerByUserId,
  restoring,
  onRestore,
  onOpenWork,
}: ActivityLogEntryRowProps) {
  const actor = resolveActivityLogActorDisplay(entry, ownerByUserId);
  const isDanger =
    entry.log.action_type === "work_delete" ||
    entry.log.action_type === "volume_delete";
  const hasFooter =
    Boolean(entry.reason) ||
    entry.isRestored ||
    entry.canRestore ||
    (isDanger && !entry.canRestore && !entry.isRestored);

  return (
    <li
      className={`log-entry${entry.isRestored ? " log-entry--restored" : ""}`}
    >
      <div className="log-entry-row">
        <div className="log-entry-main">
          <span className="log-entry-part log-entry-part--action">
            {entry.actionLabel}
          </span>
          <span className="log-entry-sep" aria-hidden>
            {" "}
            —{" "}
          </span>
          <span className="log-entry-part log-entry-part--actor">
            Par
            <ActivityLogActorBadge actor={actor} />
          </span>
          {entry.entityTitle ? (
            <>
              <span className="log-entry-sep" aria-hidden>
                {" "}
                —{" "}
              </span>
              {entry.workId ? (
                <button
                  type="button"
                  className="log-entry-part log-entry-entity-link"
                  onClick={() => onOpenWork(entry.workId!)}
                >
                  {entry.entityTitle}
                  <ExternalLink size={13} aria-hidden />
                </button>
              ) : (
                <span className="log-entry-part log-entry-part--entity">
                  {entry.entityTitle}
                </span>
              )}
            </>
          ) : null}
        </div>
        <time className="log-entry-date" dateTime={entry.createdAt}>
          {formatDateTimeFr(entry.createdAt)}
        </time>
      </div>

      {hasFooter ? (
        <div className="log-entry-footer">
          {entry.reason ? (
            <span className="log-entry-reason">« {entry.reason} »</span>
          ) : null}
          {entry.isRestored ? (
            <span className="log-restored-badge">
              Restauré
              {entry.restoredByEmail &&
              entry.restoredByEmail !== entry.userEmail ? (
                <>
                  {" "}
                  par{" "}
                  <strong>
                    {resolveLinkedUserDisplayLabel(
                      entry.log.restored_by_user_id,
                      entry.restoredByEmail,
                      ownerByUserId,
                    )}
                  </strong>
                </>
              ) : null}
            </span>
          ) : entry.canRestore ? (
            <button
              type="button"
              className="log-restore-btn"
              disabled={restoring}
              onClick={onRestore}
            >
              {restoring ? (
                <>
                  <Loader2 size={14} className="spin" aria-hidden />
                  Restauration…
                </>
              ) : (
                <>
                  <RotateCcw size={14} aria-hidden />
                  Restaurer
                </>
              )}
            </button>
          ) : isDanger ? (
            <span className="log-restore-unavailable">
              Restauration indisponible (aucune sauvegarde).
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ActivityLogActorBadge({ actor }: { actor: ActivityLogActorDisplay }) {
  return (
    <span className="log-entry-actor-badge">
      {actor.color ? (
        <span
          className="log-actor-dot"
          style={{ "--actor-color": actor.color } as CSSProperties}
          aria-hidden
        />
      ) : null}
      <strong>{actor.label}</strong>
    </span>
  );
}
