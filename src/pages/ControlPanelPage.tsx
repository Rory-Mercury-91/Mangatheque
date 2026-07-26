import { useEffect, useMemo, useState } from "react";
import { AdkamiSearchPickerModal } from "@/features/adkami/AdkamiSearchPickerModal";
import { AdkamiSeasonMapModal } from "@/features/adkami/AdkamiSeasonMapModal";
import { isTauriRuntime } from "@/lib/platform";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  applyAdkamiLookupPick,
  getAdkamiLookupJobState,
  pauseAdkamiIdLookupJob,
  refreshAdkamiLookupMultiSeason,
  resetAdkamiIdLookupJob,
  startAdkamiIdLookupJob,
  subscribeAdkamiLookupJob,
  summarizeAdkamiLookupResults,
  type AdkamiLookupJobState,
  type AdkamiLookupResultRow,
  type AdkamiLookupStatus,
} from "@/services/adkamiIdLookupService";
import { buildAdkamiSearchPageUrl } from "@/services/adkamiSearchService";
import {
  listUnknownAdkamiContentTypes,
  getAdkamiAudioPreference,
} from "@/utils/adkamiUnknownTypes";
import "@/components/common/ghostActionBtn.css";
import "@/pages/ActivityLogsPage.css";
import "./ControlPanelPage.css";

type ResultFilter = "all" | AdkamiLookupStatus | "multi";

/**
 * @description Panel de contrôles (scrap ADKami multi-saisons, scan IDs, alertes…).
 */
export function ControlPanelPage() {
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSeedId, setMapSeedId] = useState<string | null>(null);
  const [mapInitialId, setMapInitialId] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [job, setJob] = useState<AdkamiLookupJobState>(getAdkamiLookupJobState);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pickRow, setPickRow] = useState<AdkamiLookupResultRow | null>(null);
  const [includeLinked, setIncludeLinked] = useState(false);

  const unknownTypes = useMemo(() => listUnknownAdkamiContentTypes(), [mapKey]);
  const audio = getAdkamiAudioPreference();
  const canScrap = isTauriRuntime();
  const summary = useMemo(
    () => summarizeAdkamiLookupResults(job.results),
    [job.results],
  );

  useEffect(() => subscribeAdkamiLookupJob(setJob), []);

  const filteredResults = useMemo(() => {
    if (filter === "all") return job.results;
    if (filter === "multi") {
      return job.results.filter((r) => r.multiSeason);
    }
    return job.results.filter((r) => r.status === filter);
  }, [filter, job.results]);

  const handleStart = async (resume: boolean) => {
    setActionError(null);
    setBusy(true);
    try {
      await startAdkamiIdLookupJob({ resume, includeLinked });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Impossible de démarrer le scan.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openSeasonMap = (row: AdkamiLookupResultRow) => {
    if (row.linkedAdkamiId == null) return;
    setMapSeedId(row.animeId);
    setMapInitialId(String(row.linkedAdkamiId));
    setMapOpen(true);
  };

  const handleDetectSeasons = async (row: AdkamiLookupResultRow) => {
    setActionError(null);
    setBusy(true);
    try {
      await refreshAdkamiLookupMultiSeason(row.animeId);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Détection multi-saison impossible.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="control-panel-page">
      <header className="logs-header">
        <h1>Contrôle</h1>
      </header>

      <section className="control-panel-card">
        <h2>Scan IDs ADKami</h2>
        <p>
          Recherche par nom (titre EN / original) sur{" "}
          <code>adkami.com/video?search=…</code> pour{" "}
          <strong>toute la bibliothèque animé</strong> (paginée). Les fiches
          déjà liées sont marquées sans requête web, sauf si vous cochez
          l&apos;option ci-dessous. 1 résultat + match → liaison auto ;
          plusieurs → choix manuel.
        </p>
        {!canScrap ? (
          <p className="control-panel-warn" role="status">
            Disponible uniquement dans l&apos;application native.
          </p>
        ) : null}
        <label className="control-panel-checkbox">
          <input
            type="checkbox"
            checked={includeLinked}
            disabled={job.status === "running"}
            onChange={(e) => setIncludeLinked(e.target.checked)}
          />
          <span>
            Rechercher aussi les fiches déjà liées (ne remplace pas l&apos;ID
            sans confirmation)
          </span>
        </label>
        <div className="control-panel-actions">
          <button
            type="button"
            className="ghost-action-btn"
            disabled={!canScrap || busy || job.status === "running"}
            onClick={() => void handleStart(false)}
          >
            Lancer le scan
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={
              !canScrap ||
              busy ||
              job.status === "running" ||
              job.queueIds.length === 0
            }
            onClick={() => void handleStart(true)}
          >
            Reprendre
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={!canScrap || job.status !== "running"}
            onClick={() => pauseAdkamiIdLookupJob()}
          >
            Pause
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={busy || job.status === "running"}
            onClick={() => resetAdkamiIdLookupJob()}
          >
            Réinitialiser
          </button>
        </div>
        <p className="control-panel-job-status" role="status">
          État : <strong>{jobStatusLabel(job.status)}</strong>
          {job.queueIds.length > 0
            ? ` · ${job.cursor}/${job.queueIds.length}`
            : ""}
          {job.lastMessage ? ` — ${job.lastMessage}` : ""}
        </p>
        <div className="control-panel-counters">
          <button
            type="button"
            className={filter === "all" ? "is-active" : ""}
            onClick={() => setFilter("all")}
          >
            Tous ({job.results.length})
          </button>
          <button
            type="button"
            className={filter === "auto_linked" ? "is-active" : ""}
            onClick={() => setFilter("auto_linked")}
          >
            Liés auto ({summary.auto_linked})
          </button>
          <button
            type="button"
            className={filter === "already_linked" ? "is-active" : ""}
            onClick={() => setFilter("already_linked")}
          >
            Déjà liés ({summary.already_linked})
          </button>
          <button
            type="button"
            className={filter === "needs_pick" ? "is-active" : ""}
            onClick={() => setFilter("needs_pick")}
          >
            À choisir ({summary.needs_pick})
          </button>
          <button
            type="button"
            className={filter === "not_found" ? "is-active" : ""}
            onClick={() => setFilter("not_found")}
          >
            Introuvables ({summary.not_found})
          </button>
          <button
            type="button"
            className={filter === "error" ? "is-active" : ""}
            onClick={() => setFilter("error")}
          >
            Erreurs ({summary.error})
          </button>
          <button
            type="button"
            className={filter === "multi" ? "is-active" : ""}
            onClick={() => setFilter("multi")}
          >
            Multi-saisons ({summary.multi})
          </button>
        </div>
        {actionError ? (
          <p className="control-panel-warn" role="alert">
            {actionError}
          </p>
        ) : null}
        {filteredResults.length === 0 ? (
          <p className="control-panel-empty">Aucun résultat pour ce filtre.</p>
        ) : (
          <ul className="control-panel-lookup-list">
            {filteredResults.map((row) => (
              <li key={row.animeId}>
                <div className="control-panel-lookup-main">
                  <strong>{row.label}</strong>
                  <span className={`control-panel-badge status-${row.status}`}>
                    {resultStatusLabel(row)}
                  </span>
                  {row.multiSeason ? (
                    <span className="control-panel-badge status-multi">
                      Multi-saison
                      {row.seasonCount != null ? ` (${row.seasonCount})` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="control-panel-lookup-meta">
                  {row.query ? <span>Query : {row.query}</span> : null}
                  {row.linkedAdkamiId != null ? (
                    <span>
                      ID {row.linkedAdkamiId}
                      {row.linkedSection ? ` · ${row.linkedSection}` : ""}
                    </span>
                  ) : null}
                  {row.errorMessage ? <span>{row.errorMessage}</span> : null}
                </div>
                <div className="control-panel-lookup-actions">
                  {row.status === "needs_pick" ? (
                    <button
                      type="button"
                      className="ghost-action-btn"
                      disabled={busy}
                      onClick={() => setPickRow(row)}
                      title="Choisir l'ID ADKami puis ouvrir l'attribution des saisons"
                    >
                      Choisir → saisons
                    </button>
                  ) : null}
                  {row.linkedAdkamiId != null ? (
                    <>
                      <button
                        type="button"
                        className="ghost-action-btn"
                        disabled={busy}
                        onClick={() => openSeasonMap(row)}
                      >
                        Attribution saisons
                      </button>
                      <button
                        type="button"
                        className="ghost-action-btn"
                        disabled={busy}
                        onClick={() => void handleDetectSeasons(row)}
                      >
                        {row.multiSeason == null
                          ? "Détecter saisons"
                          : "Rescanner saisons"}
                      </button>
                    </>
                  ) : null}
                  {row.status === "not_found" && row.query ? (
                    <button
                      type="button"
                      className="ghost-action-btn"
                      onClick={() =>
                        void openExternalUrl(buildAdkamiSearchPageUrl(row.query))
                      }
                    >
                      Ouvrir la recherche
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="control-panel-card">
        <h2>Attribution saisons ADKami</h2>
        <p>
          Scrappe la fiche ADKami, découpe les saisons (et OAV / films /
          spéciaux), puis attribue chaque bloc à une fiche MAL de votre
          bibliothèque. Audio courant :{" "}
          <strong>{audio === "vf" ? "VF" : "VOSTFR"}</strong>.
        </p>
        {!canScrap ? (
          <p className="control-panel-warn" role="status">
            Disponible uniquement dans l&apos;application native (desktop /
            mobile).
          </p>
        ) : null}
        <button
          type="button"
          className="ghost-action-btn"
          disabled={!canScrap}
          onClick={() => {
            setMapSeedId(null);
            setMapInitialId(null);
            setMapOpen(true);
          }}
        >
          Lancer l&apos;analyse ADKami
        </button>
      </section>

      <section className="control-panel-card">
        <h2>Types ADKami inconnus</h2>
        {unknownTypes.length === 0 ? (
          <p className="control-panel-empty">
            Aucun type non catalogué détecté pour le moment.
          </p>
        ) : (
          <ul className="control-panel-unknown-list">
            {unknownTypes.map((row) => (
              <li key={row.code}>
                <strong>Type {row.code}</strong>
                <span>
                  {row.label || "—"} · vu {row.hitCount}× ·{" "}
                  {new Date(row.lastSeenAt).toLocaleString("fr-FR")}
                </span>
                <a href={row.sampleUrl} target="_blank" rel="noreferrer">
                  Exemple
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AdkamiSearchPickerModal
        open={Boolean(pickRow)}
        query={pickRow?.query ?? ""}
        hits={pickRow?.hits ?? []}
        animeLabel={pickRow?.label ?? null}
        onClose={() => setPickRow(null)}
        onSelect={(hit) => {
          if (!pickRow) return;
          const animeId = pickRow.animeId;
          void (async () => {
            setBusy(true);
            setActionError(null);
            try {
              const linked = await applyAdkamiLookupPick(animeId, hit);
              setPickRow(null);
              // Enchaîne sur l'attribution des saisons (Partie 1/2, digressions…).
              setMapSeedId(linked.animeId);
              setMapInitialId(String(hit.adkamiId));
              setMapOpen(true);
            } catch (err) {
              setActionError(
                err instanceof Error ? err.message : "Liaison impossible.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      />

      <AdkamiSeasonMapModal
        open={mapOpen}
        initialIdOrUrl={mapInitialId}
        seedAnimeId={mapSeedId}
        onClose={() => {
          setMapOpen(false);
          setMapSeedId(null);
          setMapInitialId(null);
        }}
        onApplied={() => setMapKey((k) => k + 1)}
      />
    </main>
  );
}

function jobStatusLabel(status: AdkamiLookupJobState["status"]): string {
  switch (status) {
    case "running":
      return "en cours";
    case "paused":
      return "en pause";
    case "done":
      return "terminé";
    default:
      return "inactif";
  }
}

function resultStatusLabel(row: AdkamiLookupResultRow): string {
  switch (row.status) {
    case "auto_linked":
      return "Lié auto";
    case "already_linked":
      return "Déjà lié";
    case "needs_pick":
      return "À choisir";
    case "not_found":
      return "Introuvable";
    case "error":
      return "Erreur";
    default:
      return "En attente";
  }
}
