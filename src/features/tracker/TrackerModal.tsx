import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import {
  isTrackerProviderConfigured,
  getTrackerConfigHelpMessage,
} from "@/services/tracker/trackerConfig";
import {
  startAniListOauth,
  startMalOauth,
} from "@/services/tracker/trackerOauthService";
import { getTrackerRedirectUrl } from "@/services/tracker/trackerRedirectService";
import { syncAllWorksFromTracker } from "@/services/tracker/trackerSyncService";
import {
  disconnectTrackerAccount,
  fetchLinkedTrackerAccounts,
} from "@/services/tracker/trackerTokenService";
import type { TrackerProvider, UserTrackerAccount } from "@/types/tracker";
import "./TrackerModal.css";

export interface TrackerModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * @description Modale de liaison MAL / AniList pour le compte connecté.
 */
export function TrackerModal({ open, onClose }: TrackerModalProps) {
  const [accounts, setAccounts] = useState<UserTrackerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const redirectUri = useMemo(() => getTrackerRedirectUrl(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await fetchLinkedTrackerAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void load();
  }, [open, load]);

  // Recharge le statut après retour du navigateur OAuth
  useEffect(() => {
    if (!open) {
      return;
    }
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [open, load]);

  const byProvider = useMemo(() => {
    const map = new Map<TrackerProvider, UserTrackerAccount>();
    for (const account of accounts) {
      map.set(account.provider, account);
    }
    return map;
  }, [accounts]);

  const handleConnect = async (provider: TrackerProvider) => {
    setBusy(`connect-${provider}`);
    setError(null);
    setInfo(null);
    try {
      if (!isTrackerProviderConfigured(provider)) {
        throw new Error(getTrackerConfigHelpMessage(provider));
      }
      if (provider === "anilist") {
        await startAniListOauth();
      } else {
        await startMalOauth();
      }
      setInfo(
        "Navigateur ouvert — validez l'autorisation. Sur mobile, l'app doit se rouvrir via mangatheque://. Si rien ne change, vérifiez que l'URI ci-dessous est bien la seule enregistrée chez MAL / AniList.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async (provider: TrackerProvider) => {
    setBusy(`disconnect-${provider}`);
    setError(null);
    setInfo(null);
    try {
      await disconnectTrackerAccount(provider);
      await load();
      setInfo(
        provider === "mal"
          ? "MyAnimeList déconnecté."
          : "AniList déconnecté.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Déconnexion impossible.");
    } finally {
      setBusy(null);
    }
  };

  const handleSyncAll = async (provider: TrackerProvider) => {
    setBusy(`sync-${provider}`);
    setError(null);
    setInfo(null);
    try {
      const results = await syncAllWorksFromTracker(provider);
      const applied = results.filter(
        (row) => row.chaptersApplied != null || row.volumesApplied != null,
      ).length;
      setInfo(
        `${applied} série${applied > 1 ? "s" : ""} mise${applied > 1 ? "s" : ""} à jour depuis ${provider === "mal" ? "MAL" : "AniList"}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synchronisation impossible.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      title="Trackers MAL / AniList"
      onClose={onClose}
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <div className="tracker-modal">
        <p className="tracker-modal-intro">
          Connectez votre compte MyAnimeList ou AniList. Les jetons sont liés au
          compte Mangathèque connecté. Une seule clé API app suffit pour le
          foyer.
        </p>

        <p className="tracker-modal-redirect">
          URI de redirection à enregistrer :{" "}
          <code>{redirectUri}</code>
        </p>

        {loading ? (
          <p className="tracker-modal-status">Chargement…</p>
        ) : (
          <ul className="tracker-modal-list">
            {(
              [
                { provider: "mal" as const, label: "MyAnimeList" },
                { provider: "anilist" as const, label: "AniList" },
              ] as const
            ).map(({ provider, label }) => {
              const account = byProvider.get(provider);
              const configured = isTrackerProviderConfigured(provider);
              return (
                <li key={provider} className="tracker-modal-row">
                  <div className="tracker-modal-row-main">
                    <strong>{label}</strong>
                    {account ? (
                      <span className="tracker-modal-linked">
                        Lié
                        {account.externalUsername
                          ? ` · ${account.externalUsername}`
                          : ""}
                      </span>
                    ) : (
                      <span className="tracker-modal-unlinked">
                        {configured ? "Non lié" : "Clé API absente"}
                      </span>
                    )}
                  </div>
                  <div className="tracker-modal-row-actions">
                    {account ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busy != null}
                          onClick={() => void handleSyncAll(provider)}
                        >
                          Sync bibliothèque
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busy != null}
                          onClick={() => void handleDisconnect(provider)}
                        >
                          <Unlink size={14} aria-hidden />
                          Déconnecter
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={busy != null || !configured}
                        onClick={() => void handleConnect(provider)}
                      >
                        <Link2 size={14} aria-hidden />
                        Connecter
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p className="tracker-modal-error" role="alert">
            {error}
          </p>
        ) : null}
        {info ? <p className="tracker-modal-info">{info}</p> : null}
      </div>
    </Modal>
  );
}
