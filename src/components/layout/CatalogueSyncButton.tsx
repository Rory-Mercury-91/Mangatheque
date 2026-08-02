import { RefreshCw } from "lucide-react";
import { useCatalogueSync } from "@/hooks/useCatalogueSync";
import "@/components/common/ghostActionBtn.css";

/**
 * @description Formate un horodatage relatif court pour le titre du bouton.
 */
function formatSyncHint(lastSyncAt: number | null, nextSyncAt: number | null): string {
  if (lastSyncAt == null) {
    return "Jamais synchronisé — cliquer pour aligner avec Supabase";
  }
  const last = new Date(lastSyncAt);
  const lastLabel = last.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (nextSyncAt == null) {
    return `Dernière sync : ${lastLabel}`;
  }
  const next = new Date(nextSyncAt);
  const nextLabel = next.toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Dernière sync : ${lastLabel} — prochaine auto ~${nextLabel} (ou maintenant)`;
}

/**
 * @description Bouton header : force la sync catalogue (ignore le délai d'1 h).
 */
export function CatalogueSyncButton() {
  const { lastSyncAt, nextSyncAt, syncing, syncNow } = useCatalogueSync();

  const title = syncing
    ? "Synchronisation en cours…"
    : formatSyncHint(lastSyncAt, nextSyncAt);

  return (
    <button
      type="button"
      className={`ghost-action-btn${syncing ? " ghost-action-btn--active" : ""}`}
      onClick={() => {
        syncNow();
      }}
      disabled={syncing}
      title={title}
      aria-label="Synchroniser le catalogue avec Supabase"
    >
      <RefreshCw size={18} aria-hidden className={syncing ? "spin" : undefined} />
      <span className="ghost-action-label app-nav-action-label">Sync</span>
    </button>
  );
}
