import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CollapsibleSection } from "../../components/common/CollapsibleSection";
import { getOwnerColor } from "../../constants/ownerColors";
import {
  fetchHouseholdMembers,
  fetchOwnersWithAccountLinks,
  linkOwnerToUser,
  unlinkOwnerFromUser,
  type HouseholdMember,
  type OwnerWithAccountLink,
} from "../../services/ownerAccountLinkService";
import "./OwnerAccountLinkPanel.css";

const PANEL_OPEN_STORAGE_KEY = "owner-account-link-panel-open";

/**
 * @description Panneau admin : associer chaque propriétaire à un compte Supabase du foyer.
 */
export function OwnerAccountLinkPanel() {
  const [owners, setOwners] = useState<OwnerWithAccountLink[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingOwnerId, setSavingOwnerId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [openInitialized, setOpenInitialized] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ownerRows, memberRows] = await Promise.all([
        fetchOwnersWithAccountLinks(),
        fetchHouseholdMembers(),
      ]);
      setOwners(ownerRows);
      setMembers(memberRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les liaisons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || openInitialized || owners.length === 0) {
      return;
    }

    const stored = localStorage.getItem(PANEL_OPEN_STORAGE_KEY);
    if (stored !== null) {
      setOpen(stored === "true");
    } else {
      const needsSetup = owners.some((owner) => !owner.linkedUserId);
      setOpen(needsSetup);
    }
    setOpenInitialized(true);
  }, [loading, openInitialized, owners]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    localStorage.setItem(PANEL_OPEN_STORAGE_KEY, String(next));
  }, []);

  const linkedCount = useMemo(
    () => owners.filter((owner) => owner.linkedUserId).length,
    [owners],
  );

  const unlinkedCount = owners.length - linkedCount;

  const summaryLabel = useMemo(() => {
    if (loading) {
      return "Chargement…";
    }
    if (owners.length === 0) {
      return "Aucun propriétaire";
    }
    if (unlinkedCount === 0) {
      return `${linkedCount} liaison${linkedCount > 1 ? "s" : ""} configurée${linkedCount > 1 ? "s" : ""}`;
    }
    return `${linkedCount}/${owners.length} lié${linkedCount > 1 ? "s" : ""} · ${unlinkedCount} en attente`;
  }, [loading, owners.length, linkedCount, unlinkedCount]);

  const handleSelect = async (ownerId: string, value: string) => {
    setSavingOwnerId(ownerId);
    setError(null);
    try {
      if (value === "") {
        await unlinkOwnerFromUser(ownerId);
      } else {
        await linkOwnerToUser(ownerId, value);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la mise à jour.");
    } finally {
      setSavingOwnerId(null);
    }
  };

  return (
    <CollapsibleSection
      title="Liaison propriétaire ↔ compte"
      open={openInitialized ? open : false}
      onOpenChange={handleOpenChange}
      className="owner-account-link-panel"
      actions={
        <span
          className={`owner-account-link-summary${
            !loading && unlinkedCount > 0 ? " owner-account-link-summary--pending" : ""
          }`}
        >
          {summaryLabel}
        </span>
      }
    >
      {error && (
        <p className="owner-account-link-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="owner-account-link-muted">Chargement des propriétaires et comptes…</p>
      ) : (
        <ul className="owner-account-link-list">
          {owners.map((owner) => {
            const busy = savingOwnerId === owner.id;
            const ownerColor = getOwnerColor(owner.name);

            return (
              <li key={owner.id} className="owner-account-link-row">
                <span
                  className="owner-account-link-name"
                  style={{ "--owner-color": ownerColor } as CSSProperties}
                  title="Associe le compte correspondant"
                >
                  {owner.name}
                </span>
                <select
                  className="owner-account-link-select"
                  value={owner.linkedUserId ?? ""}
                  disabled={busy}
                  aria-label={`Compte lié pour ${owner.name}`}
                  onChange={(event) => void handleSelect(owner.id, event.target.value)}
                >
                  <option value="">— Aucun compte —</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.email ?? member.userId}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
