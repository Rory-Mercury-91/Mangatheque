import { useEffect, useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import { AdkamiSearchPickerModal } from "@/features/adkami/AdkamiSearchPickerModal";
import { AdkamiSeasonMapModal } from "@/features/adkami/AdkamiSeasonMapModal";
import { useDevMode } from "@/hooks/useDevMode";
import { isTauriRuntime } from "@/lib/platform";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  applyAdkamiLookupPick,
  getAdkamiLookupJobState,
  markAdkamiLookupResolvedByAdkamiId,
  markAdkamiLookupResolvedByAnimeId,
  markAdkamiLookupDeferred,
  pauseAdkamiIdLookupJob,
  reconcileAdkamiLookupWithLibrary,
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
import { copyTextToClipboard } from "@/utils/clipboard";
import "@/components/common/ghostActionBtn.css";
import "@/pages/ActivityLogsPage.css";
import "./ControlPanelPage.css";

type ResultFilter = "all" | AdkamiLookupStatus | "multi" | "validated";

/**
 * @description Panel de contrôles (scrap ADKami multi-saisons, scan IDs, alertes…).
 */
export function ControlPanelPage() {
  const [devMode, setDevMode] = useDevMode();
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSeedId, setMapSeedId] = useState<string | null>(null);
  const [mapInitialId, setMapInitialId] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [job, setJob] = useState<AdkamiLookupJobState>(getAdkamiLookupJobState);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [pickRow, setPickRow] = useState<AdkamiLookupResultRow | null>(null);
  const [includeLinked, setIncludeLinked] = useState(false);
  const [hideDeferred, setHideDeferred] = useState(() => {
    try {
      return localStorage.getItem("mangatheque.adkami.hideDeferred") !== "0";
    } catch {
      return true;
    }
  });

  const unknownTypes = useMemo(() => listUnknownAdkamiContentTypes(), [mapKey]);
  const audio = getAdkamiAudioPreference();
  const canScrap = isTauriRuntime();
  const summary = useMemo(
    () => summarizeAdkamiLookupResults(job.results),
    [job.results],
  );

  useEffect(() => subscribeAdkamiLookupJob(setJob), []);

  useEffect(() => {
    void reconcileAdkamiLookupWithLibrary().catch(() => {
      // Ignore : affichage local inchangé si BDD indisponible.
    });
  }, []);

  const filteredResults = useMemo(() => {
    let rows = job.results;
    if (filter === "all") {
      rows = hideDeferred
        ? rows.filter((r) => r.status !== "deferred")
        : rows;
    } else if (filter === "multi") {
      rows = rows.filter((r) => r.multiSeason);
    } else if (filter === "validated") {
      rows = rows.filter((r) => r.mappingValidated);
    } else {
      rows = rows.filter((r) => r.status === filter);
    }
    return rows;
  }, [filter, job.results, hideDeferred]);

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

  /**
   * @description Resynchronise l’état React après une action sur le job (HMR / singleton).
   */
  const syncJobFromService = () => {
    const next = getAdkamiLookupJobState();
    setJob({
      ...next,
      results: next.results.slice(),
    });
  };

  /**
   * @description Masque la fiche (et les sœurs même ID ADKami) de « À choisir ».
   */
  const handleMarkResolved = (row: AdkamiLookupResultRow) => {
    if (row.linkedAdkamiId != null) {
      markAdkamiLookupResolvedByAdkamiId(Number(row.linkedAdkamiId));
    }
    // Toujours la ligne cliquée — même si l’ID ADKami n’a matché personne.
    markAdkamiLookupResolvedByAnimeId(row.animeId);
    syncJobFromService();
  };

  /**
   * @description Classe la fiche en « pas encore sorti ».
   */
  const handleMarkDeferred = (row: AdkamiLookupResultRow) => {
    markAdkamiLookupDeferred(row.animeId);
    syncJobFromService();
  };

  /**
   * @description Copie une valeur et affiche un retour court.
   */
  const handleCopy = async (label: string, value: string) => {
    const ok = await copyTextToClipboard(value);
    setCopyHint(ok ? `${label} copié` : `Impossible de copier ${label}`);
    window.setTimeout(() => setCopyHint(null), 1600);
  };

  return (
    <main className="control-panel-page">
      <header className="logs-header">
        <h1>Contrôle</h1>
        <ToggleSwitch
          checked={devMode}
          label="Mode dév"
          title="Active les filtres d'identifiants (MAL, AniList, ADKami) dans les bibliothèques"
          onChange={setDevMode}
        />
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
        <label className="control-panel-checkbox">
          <input
            type="checkbox"
            checked={hideDeferred}
            onChange={(e) => {
              const next = e.target.checked;
              setHideDeferred(next);
              try {
                localStorage.setItem(
                  "mangatheque.adkami.hideDeferred",
                  next ? "1" : "0",
                );
              } catch {
                // ignore
              }
            }}
          />
          <span>
            Masquer les séries « pas encore sorties » dans la vue Tous (
            {summary.deferred})
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
            className={filter === "resolved" ? "is-active" : ""}
            onClick={() => setFilter("resolved")}
          >
            Traités ({summary.resolved})
          </button>
          <button
            type="button"
            className={filter === "deferred" ? "is-active" : ""}
            onClick={() => setFilter("deferred")}
          >
            Pas encore sortis ({summary.deferred})
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
          <button
            type="button"
            className={filter === "validated" ? "is-active" : ""}
            onClick={() => setFilter("validated")}
          >
            Validés 🔒 ({summary.validated})
          </button>
        </div>
        {actionError ? (
          <p className="control-panel-warn" role="alert">
            {actionError}
          </p>
        ) : null}
        {copyHint ? (
          <p className="control-panel-copy-hint" role="status">
            {copyHint}
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
                  {row.mappingValidated ? (
                    <span className="control-panel-badge status-validated">
                      🔒 Validé
                    </span>
                  ) : null}
                  {row.multiSeason ? (
                    <span className="control-panel-badge status-multi">
                      Multi-saison
                      {row.seasonCount != null ? ` (${row.seasonCount})` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="control-panel-lookup-meta">
                  {row.query ? (
                    <span className="control-panel-copyable">
                      Query : {row.query}
                      <button
                        type="button"
                        className="ghost-action-btn control-panel-copy-btn"
                        title="Copier la query"
                        onClick={() => void handleCopy("Query", row.query)}
                      >
                        Copier
                      </button>
                    </span>
                  ) : null}
                  {row.malId != null ? (
                    <span className="control-panel-copyable">
                      MAL {row.malId}
                      <button
                        type="button"
                        className="ghost-action-btn control-panel-copy-btn"
                        title="Copier l'ID MAL"
                        onClick={() =>
                          void handleCopy("MAL", String(row.malId))
                        }
                      >
                        Copier
                      </button>
                    </span>
                  ) : null}
                  <span className="control-panel-copyable">
                    Fiche : {row.label}
                    <button
                      type="button"
                      className="ghost-action-btn control-panel-copy-btn"
                      title="Copier le libellé de la fiche MAL"
                      onClick={() => void handleCopy("Fiche MAL", row.label)}
                    >
                      Copier
                    </button>
                  </span>
                  {row.linkedAdkamiId != null ? (
                    <span>
                      ID {row.linkedAdkamiId}
                      {row.linkedSection
                        ? ` · ${formatAdkamiSectionLabel(row.linkedSection)}`
                        : ""}
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
                  <button
                    type="button"
                    className="ghost-action-btn"
                    onClick={() =>
                      void openExternalUrl(buildAdkamiSearchPageUrl(row.query))
                    }
                    disabled={!row.query}
                    title="Ouvrir la recherche ADKami dans le navigateur"
                  >
                    Ouvrir la recherche
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    title="Saison pas encore sur ADKami / pas encore diffusée"
                    onClick={() => handleMarkDeferred(row)}
                  >
                    Pas encore sorti
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    title="Masquer de « À choisir » (déjà géré)"
                    onClick={() => handleMarkResolved(row)}
                  >
                    Masquer
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={busy || row.linkedAdkamiId == null}
                    onClick={() => openSeasonMap(row)}
                    title={
                      row.linkedAdkamiId == null
                        ? "Liez d'abord un ID ADKami"
                        : "Ouvrir l'attribution des saisons"
                    }
                  >
                    Attribution saisons
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={busy || row.linkedAdkamiId == null}
                    onClick={() => void handleDetectSeasons(row)}
                    title={
                      row.linkedAdkamiId == null
                        ? "Liez d'abord un ID ADKami"
                        : "Détecter les saisons ADKami"
                    }
                  >
                    {row.multiSeason == null
                      ? "Détecter saisons"
                      : "Rescanner saisons"}
                  </button>
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
        onApplied={() => {
          setMapKey((k) => k + 1);
          const adkamiId = Number(mapInitialId);
          if (Number.isFinite(adkamiId) && adkamiId > 0) {
            markAdkamiLookupResolvedByAdkamiId(adkamiId);
          }
          if (mapSeedId) {
            markAdkamiLookupResolvedByAnimeId(mapSeedId);
          }
          syncJobFromService();
          void reconcileAdkamiLookupWithLibrary().catch(() => undefined);
        }}
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
    case "resolved":
      return "Traité";
    case "deferred":
      return "Pas encore sorti";
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

/**
 * @description Libellé FR d'une section ADKami (anime / hentai / drama).
 */
function formatAdkamiSectionLabel(section: string): string {
  switch (section.trim().toLowerCase()) {
    case "anime":
      return "Animé";
    case "hentai":
      return "Hentai";
    case "drama":
      return "Drama";
    default:
      return section;
  }
}
