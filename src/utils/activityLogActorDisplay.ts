import { getOwnerColor, getOwnerDisplayName } from "@/constants/ownerColors";
import { resolveLogActor } from "@/services/activityLogService";
import type { OwnerWithAccountLink } from "@/services/ownerAccountLinkService";
import { isPlanningActivityLog } from "@/services/planningNotificationService";
import type { ActivityLog, ActivityLogActor, ActivityLogViewEntry } from "@/types/activityLog";

/** Couleur de la pastille pour les actions Nautiljon (planning). */
export const NAUTILJON_ACTOR_COLOR = "#c084fc";

/** Identifiant fictif pour filtrer les entrées Nautiljon (planning). */
export const NAUTILJON_ACTOR_ID = "nautiljon:planning";

/** Libellé court affiché dans les filtres auteur. */
export const NAUTILJON_ACTOR_LABEL = "Nautiljon";

/** Profil propriétaire lié à un compte Supabase. */
export interface LinkedOwnerProfile {
  ownerId: string;
  name: string;
  displayName: string;
  color: string;
}

/** Affichage auteur dans le journal. */
export interface ActivityLogActorDisplay {
  label: string;
  color: string | null;
}

/**
 * @description Indexe les propriétaires liés par identifiant utilisateur Supabase.
 */
export function buildLinkedOwnerByUserId(
  owners: OwnerWithAccountLink[],
): Map<string, LinkedOwnerProfile> {
  const map = new Map<string, LinkedOwnerProfile>();

  for (const owner of owners) {
    if (!owner.linkedUserId) {
      continue;
    }

    map.set(owner.linkedUserId, {
      ownerId: owner.id,
      name: owner.name,
      displayName: getOwnerDisplayName(owner.name),
      color: getOwnerColor(owner.name),
    });
  }

  return map;
}

/**
 * @description Résout le libellé et la couleur d'auteur pour une entrée du journal.
 */
export function resolveActivityLogActorDisplay(
  entry: ActivityLogViewEntry,
  ownerByUserId: Map<string, LinkedOwnerProfile>,
): ActivityLogActorDisplay {
  if (entry.isPlanningUpdate) {
    return {
      label: "Nautiljon (planning)",
      color: NAUTILJON_ACTOR_COLOR,
    };
  }

  const actor = resolveLogActor(entry.log);
  if (actor.userId) {
    const linked = ownerByUserId.get(actor.userId);
    if (linked) {
      return {
        label: linked.displayName,
        color: linked.color,
      };
    }
  }

  return {
    label: entry.actorLabel,
    color: null,
  };
}

/**
 * @description Résout un libellé utilisateur (email ou propriétaire lié).
 */
export function resolveLinkedUserDisplayLabel(
  userId: string | null | undefined,
  userEmail: string | null | undefined,
  ownerByUserId: Map<string, LinkedOwnerProfile>,
): string {
  if (userId) {
    const linked = ownerByUserId.get(userId);
    if (linked) {
      return linked.displayName;
    }
  }

  if (userEmail) {
    return userEmail;
  }

  return "Utilisateur inconnu";
}

/**
 * @description Enrichit la liste des auteurs filtres avec nom affiché et couleur.
 */
export function enrichActivityLogActors(
  actors: Array<{ userId: string; userEmail: string }>,
  ownerByUserId: Map<string, LinkedOwnerProfile>,
): Array<{
  userId: string;
  userEmail: string;
  displayLabel: string;
  dotColor: string;
}> {
  return actors.map((actor) => {
    const linked = ownerByUserId.get(actor.userId);
    return {
      ...actor,
      displayLabel: linked?.displayName ?? actor.userEmail,
      dotColor: linked?.color ?? "#6366f1",
    };
  });
}

/**
 * @description Construit la liste des auteurs filtrables (comptes + Nautiljon si présent).
 */
export function buildActivityLogFilterActors(
  actors: ActivityLogActor[],
  allLogs: ActivityLog[],
  ownerByUserId: Map<string, LinkedOwnerProfile>,
): ActivityLogActor[] {
  const enriched = enrichActivityLogActors(actors, ownerByUserId);
  const hasPlanningLogs = allLogs.some((log) => isPlanningActivityLog(log));

  if (!hasPlanningLogs) {
    return enriched;
  }

  return [
    {
      userId: NAUTILJON_ACTOR_ID,
      userEmail: "Nautiljon (planning)",
      displayLabel: NAUTILJON_ACTOR_LABEL,
      dotColor: NAUTILJON_ACTOR_COLOR,
    },
    ...enriched,
  ];
}
