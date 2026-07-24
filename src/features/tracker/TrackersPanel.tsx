import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { StickyAlert } from "@/components/common/StickyAlert";
import {
  isTrackerProviderConfigured,
  getTrackerConfigHelpMessage,
} from "@/services/tracker/trackerConfig";
import {
  startAniListOauth,
  startMalOauth,
} from "@/services/tracker/trackerOauthService";
import { syncAllWorksFromTracker } from "@/services/tracker/trackerSyncService";
import {
  formatAnimeSyncFailureReport,
  summarizeAnimeSyncResults,
  syncAllAnimesFromMal,
  syncGlobalTrackers,
} from "@/services/tracker/animeSyncService";
import {
  disconnectTrackerAccount,
  fetchLinkedTrackerAccounts,
} from "@/services/tracker/trackerTokenService";
import type {
  TrackerProvider,
  TrackerSyncProgress,
  UserTrackerAccount,
} from "@/types/tracker";
import "@/features/tracker/TrackerModal.css";

type ProgressByProvider = Partial<Record<TrackerProvider, TrackerSyncProgress>>;

/**
 * @description Panneau connexions + sync manga / anime / global (sous-onglet Trackers).
 */
export function TrackersPanel() {
  const [accounts, setAccounts] = useState<UserTrackerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [failureReport, setFailureReport] = useState<string | null>(null);
  const [progressByProvider, setProgressByProvider] =
    useState<ProgressByProvider>({});

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
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const byProvider = useMemo(() => {
    const map = new Map<TrackerProvider, UserTrackerAccount>();
    for (const account of accounts) {
      map.set(account.provider, account);
    }
    return map;
  }, [accounts]);

  const setProviderProgress = useCallback(
    (provider: TrackerProvider, progress: TrackerSyncProgress | null) => {
      setProgressByProvider((prev) => {
        if (progress == null) {
          const next = { ...prev };
          delete next[provider];
          return next;
        }
        return { ...prev, [provider]: progress };
      });
    },
    [],
  );

  const clearAllProgress = useCallback(() => {
    setProgressByProvider({});
  }, []);

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
        "Navigateur ouvert — validez l'autorisation. Sur mobile, l'app doit se rouvrir via mangatheque://.",
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

  const handleSyncManga = async (provider: TrackerProvider) => {
    setBusy(`sync-manga-${provider}`);
    setError(null);
    setInfo(null);
    setProviderProgress(provider, {
      current: 0,
      total: 0,
      label: "Préparation…",
      phase: "loading",
    });
    try {
      const results = await syncAllWorksFromTracker(provider, (progress) => {
        setProviderProgress(provider, progress);
      });
      const applied = results.filter(
        (row) =>
          row.chaptersApplied != null ||
          row.volumesApplied != null ||
          (row.pushedProviders?.length ?? 0) > 0,
      ).length;
      setInfo(
        `${applied} série${applied > 1 ? "s" : ""} manga synchronisée${applied > 1 ? "s" : ""} (${provider === "mal" ? "MAL" : "AniList"}).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync manga impossible.");
    } finally {
      setBusy(null);
      window.setTimeout(() => setProviderProgress(provider, null), 1200);
    }
  };

  const handleSyncAnime = async () => {
    setBusy("sync-anime");
    setError(null);
    setInfo(null);
    setFailureReport(null);
    setProviderProgress("mal", {
      current: 0,
      total: 0,
      label: "Préparation…",
      phase: "loading",
    });
    try {
      const results = await syncAllAnimesFromMal((progress) => {
        setProviderProgress("mal", progress);
      });
      setInfo(summarizeAnimeSyncResults(results));
      setFailureReport(formatAnimeSyncFailureReport(results));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync anime impossible.");
    } finally {
      setBusy(null);
      window.setTimeout(() => setProviderProgress("mal", null), 1200);
    }
  };

  const handleSyncGlobal = async () => {
    setBusy("sync-global");
    setError(null);
    setInfo(null);
    setFailureReport(null);
    clearAllProgress();
    try {
      const result = await syncGlobalTrackers({
        onProgress: (provider, progress) => {
          setProviderProgress(provider, progress);
        },
      });
      setInfo(
        `Sync globale — manga MAL : ${result.mangaMal}, manga AniList : ${result.mangaAniList}. ${result.animeMessage}`,
      );
      setFailureReport(result.animeFailureReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync globale impossible.");
    } finally {
      setBusy(null);
      window.setTimeout(() => clearAllProgress(), 1400);
    }
  };

  return (
    <div className="tracker-modal trackers-panel">
      <section
        className="trackers-accounts"
        aria-labelledby="trackers-accounts-title"
      >
        <div className="trackers-accounts-head">
          <h2 id="trackers-accounts-title">Comptes trackers</h2>
          <button
            type="button"
            className="btn-secondary btn-sm trackers-accounts-sync"
            disabled={busy != null}
            onClick={() => void handleSyncGlobal()}
          >
            Sync global
          </button>
        </div>

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
              const progress = progressByProvider[provider];
              const percent =
                progress && progress.total > 0
                  ? Math.min(
                      100,
                      Math.round((progress.current / progress.total) * 100),
                    )
                  : progress?.phase === "loading"
                    ? 5
                    : 0;

              return (
                <li key={provider} className="tracker-modal-row">
                  <div className="tracker-modal-row-top">
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
                            onClick={() => void handleSyncManga(provider)}
                          >
                            Sync manga
                          </button>
                          {provider === "mal" ? (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              disabled={busy != null}
                              onClick={() => void handleSyncAnime()}
                            >
                              Sync anime
                            </button>
                          ) : null}
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
                  </div>

                  {progress ? (
                    <div
                      className="tracker-sync-progress"
                      role="status"
                      aria-live="polite"
                    >
                      <div
                        className="tracker-sync-progress-bar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        role="progressbar"
                      >
                        <span
                          className={
                            progress.phase === "loading"
                              ? "tracker-sync-progress-fill tracker-sync-progress-fill--indeterminate"
                              : "tracker-sync-progress-fill"
                          }
                          style={
                            progress.phase === "loading"
                              ? undefined
                              : { width: `${percent}%` }
                          }
                        />
                      </div>
                      <p className="tracker-sync-progress-label">
                        {progress.total > 0
                          ? `${progress.current}/${progress.total}`
                          : "…"}
                        {" · "}
                        {progress.label}
                        {progress.createdCount != null &&
                        progress.createdCount > 0
                          ? ` · ${progress.createdCount} créé${progress.createdCount > 1 ? "s" : ""}`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <StickyAlert
            variant="error"
            title="Erreur de synchronisation"
            onDismiss={() => setError(null)}
          >
            {error}
          </StickyAlert>
        ) : null}
        {info ? (
          <StickyAlert
            variant="info"
            title="Résultat"
            onDismiss={() => setInfo(null)}
          >
            {info}
          </StickyAlert>
        ) : null}
        {failureReport ? (
          <StickyAlert
            variant="error"
            title="Échecs détaillés"
            copyText={failureReport}
            onDismiss={() => setFailureReport(null)}
          >
            {failureReport}
          </StickyAlert>
        ) : null}

        <p className="trackers-accounts-hint">
          Connectez MyAnimeList / AniList. La sync manga aligne le suivi des
          séries déjà en bibliothèque. La sync anime (MAL) importe aussi les
          fiches absentes (sans doublon), puis aligne votre progression. En cas
          d&apos;échec, le détail reste affiché ci-dessous jusqu&apos;à ce que
          vous le fermiez — relancez la sync pour rattraper les manquants.
        </p>
      </section>
    </div>
  );
}
