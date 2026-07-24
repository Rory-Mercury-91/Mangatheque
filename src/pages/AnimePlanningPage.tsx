import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { StickyAlert } from "@/components/common/StickyAlert";
import "@/components/common/ghostActionBtn.css";
import { AnimePlanningCalendar } from "@/features/anime/AnimePlanningCalendar";
import { useAdkamiAgendaSync } from "@/hooks/useAdkamiAgendaSync";
import { useAuth } from "@/contexts/AuthContext";
import { isDesktopRuntime, isMobileRuntime, isTauriRuntime } from "@/lib/platform";
import {
  clearAdkamiAgendaLastError,
  fetchAnimeAgendaEntriesForWeek,
  fetchAnimesMissingAdkamiLink,
  getAdkamiAgendaLastError,
  getAdkamiMappingLastImportAt,
  importAdkamiMalMappingXml,
  isAdkamiWeekSynced,
  shouldRemindAdkamiMappingImport,
  type AnimeAgendaRow,
} from "@/services/adkamiAgendaSyncService";
import {
  formatAnimeSyncFailureReport,
  importMalAnimeListXml,
  summarizeMalAnimeListXmlImport,
} from "@/services/tracker/animeSyncService";
import {
  isAdkamiMalMappingXml,
  isMalAnimeListXml,
} from "@/utils/malAnimeListXmlParser";
import { fetchAnimeProgressForUser } from "@/services/animeProgressService";
import type { Anime } from "@/types/anime";
import { resolveAnimeDisplayTitle } from "@/types/anime";
import {
  addWeeks,
  canGoToPreviousWeek,
  formatAdkamiAgendaDate,
  formatWeekRangeLabel,
  startOfWeekMonday,
} from "@/utils/adkamiAgendaWeek";
import { isAgendaEpisodeWatched } from "@/utils/adkamiAgendaWatched";
import { formatDateTimeFr } from "@/utils/dateFormat";
import "@/pages/ReadingStatsPage.css";
import "./AnimePlanningPage.css";

const DAY_ORDER = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/**
 * @description Planning personnel des sorties d'épisodes (agenda ADKami).
 */
export function AnimePlanningPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canSync = isTauriRuntime();
  const desktop = isDesktopRuntime();
  const mobile = isMobileRuntime();
  const [weekMonday, setWeekMonday] = useState(() => startOfWeekMonday());
  const [entries, setEntries] = useState<AnimeAgendaRow[]>([]);
  const [watchedByAnimeId, setWatchedByAnimeId] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [missing, setMissing] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [showMappingReminder, setShowMappingReminder] = useState(
    shouldRemindAdkamiMappingImport(),
  );
  const [dismissedSyncError, setDismissedSyncError] = useState(false);
  const [dismissedPageError, setDismissedPageError] = useState(false);
  const weekMondayRef = useRef(weekMonday);
  weekMondayRef.current = weekMonday;
  const autoFetchTried = useRef(new Set<string>());
  const weekKey = formatAdkamiAgendaDate(weekMonday);

  const reload = useCallback(async (monday: Date) => {
    setLoading(true);
    try {
      const progressPromise = user
        ? fetchAnimeProgressForUser(user.id)
        : Promise.resolve(new Map());
      const [agenda, orphans, progressMap] = await Promise.all([
        fetchAnimeAgendaEntriesForWeek(monday),
        fetchAnimesMissingAdkamiLink(),
        progressPromise,
      ]);
      setEntries(agenda);
      setMissing(orphans);
      const watched = new Map<string, number>();
      for (const [animeId, progress] of progressMap) {
        watched.set(animeId, progress.episodes_watched);
      }
      setWatchedByAnimeId(watched);
      setShowMappingReminder(
        shouldRemindAdkamiMappingImport() && orphans.length > 0,
      );
    } catch (err) {
      setDismissedPageError(false);
      setError(
        err instanceof Error ? err.message : "Chargement du planning impossible.",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  const onSynced = useCallback(() => {
    void reload(weekMondayRef.current);
  }, [reload]);

  const { syncing, syncNow, lastError, lastStats, lastSyncedAt } =
    useAdkamiAgendaSync(onSynced, { auto: false });

  const persistedSyncError = getAdkamiAgendaLastError();
  const syncErrorMessage = lastError ?? persistedSyncError;
  const showSyncError = Boolean(syncErrorMessage) && !dismissedSyncError;
  const showPageError = Boolean(error) && !dismissedPageError;

  useEffect(() => {
    if (lastError || persistedSyncError) {
      setDismissedSyncError(false);
    }
  }, [lastError, persistedSyncError]);

  useEffect(() => {
    void reload(weekMonday);
  }, [reload, weekKey, weekMonday]);

  /**
   * Une sync ADKami à l'entrée sur la page (ou changement de semaine)
   * si cette semaine n'est pas encore en cache — pas de rechargement ensuite.
   */
  useEffect(() => {
    if (!canSync || syncing || importBusy) return;
    if (isAdkamiWeekSynced(weekMonday)) return;
    if (autoFetchTried.current.has(weekKey)) return;
    autoFetchTried.current.add(weekKey);
    void syncNow(weekMonday);
  }, [canSync, weekKey, weekMonday, syncing, importBusy, syncNow]);

  const byDay = useMemo(() => {
    const map = new Map<string, AnimeAgendaRow[]>();
    for (const entry of entries) {
      const day = entry.day_label?.trim() || "Autres";
      const list = map.get(day) ?? [];
      list.push(entry);
      map.set(day, list);
    }
    const ordered: Array<[string, AnimeAgendaRow[]]> = [];
    for (const day of DAY_ORDER) {
      ordered.push([day, map.get(day) ?? []]);
    }
    for (const [day, list] of map) {
      if (!DAY_ORDER.includes(day) && list.length > 0) {
        ordered.push([day, list]);
      }
    }
    return ordered;
  }, [entries]);

  const overlayMessage =
    busyMessage ??
    (syncing ? "Synchronisation de l'agenda ADKami…" : null) ??
    (loading ? "Chargement du planning…" : null);

  const canGoPrev = canGoToPreviousWeek(weekMonday);
  const isCurrentWeek =
    weekMonday.getTime() === startOfWeekMonday().getTime();
  const goPrev = () => {
    if (!canGoPrev) return;
    setWeekMonday((prev) => addWeeks(prev, -1));
  };
  const goNext = () => {
    setWeekMonday((prev) => addWeeks(prev, 1));
  };
  const goCurrentWeek = () => {
    setWeekMonday(startOfWeekMonday());
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImportBusy(true);
    setImportInfo(null);
    setError(null);
    setDismissedPageError(false);
    setDismissedSyncError(false);
    try {
      const xml = await file.text();

      if (isAdkamiMalMappingXml(xml)) {
        setBusyMessage("Import du mapping ADKami en cours…");
        const stats = await importAdkamiMalMappingXml(xml);
        setImportInfo(
          `Mapping ADKami importé — ${stats.updated} fiche${stats.updated > 1 ? "s" : ""} mise${stats.updated > 1 ? "s" : ""} à jour (${stats.scanned} entrées XML).`,
        );
        setShowMappingReminder(false);
      } else if (isMalAnimeListXml(xml)) {
        setBusyMessage("Import de la liste MAL en cours…");
        const { results, stats } = await importMalAnimeListXml(xml, (progress) => {
          if (progress.phase === "syncing" && progress.label) {
            setBusyMessage(progress.label);
          }
        });
        setImportInfo(summarizeMalAnimeListXmlImport(stats));
        const failureReport = formatAnimeSyncFailureReport(results);
        if (failureReport) {
          setDismissedPageError(false);
          setError(failureReport);
        }
      } else {
        throw new Error(
          "XML non reconnu. Attendu : export liste MAL (myanimelist) ou mapping ADKami (series_adk_id).",
        );
      }

      setBusyMessage("Mise à jour du planning…");
      await reload(weekMonday);
      if (canSync) {
        setBusyMessage("Synchronisation de l'agenda ADKami…");
        await syncNow(weekMonday);
      }
    } catch (err) {
      setDismissedPageError(false);
      setError(err instanceof Error ? err.message : "Import XML impossible.");
    } finally {
      setBusyMessage(null);
      setImportBusy(false);
    }
  };

  return (
    <div className="reading-stats-page anime-planning-page">
      <header className="reading-stats-header anime-planning-header">
        <div>
          <h1>Planning</h1>
          <p className="reading-stats-subtitle">
            Sorties d&apos;épisodes de vos animés (agenda ADKami)
            {lastSyncedAt
              ? ` · maj ${formatDateTimeFr(lastSyncedAt)}`
              : ""}
          </p>
        </div>
        <div className="anime-planning-actions">
          <label
            className={`btn-secondary btn-sm anime-planning-import${importBusy ? " is-disabled" : ""}`}
            aria-busy={importBusy}
            title="Accepte un export liste MAL ou un mapping ADKami (series_adk_id)"
          >
            {importBusy ? (
              <Loader2 size={14} className="spin" aria-hidden />
            ) : (
              <Upload size={14} aria-hidden />
            )}
            {importBusy ? "Import…" : "Import XML"}
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              hidden
              disabled={importBusy || syncing}
              title="Liste MAL ou mapping ADKami"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void handleImportFile(file);
              }}
            />
          </label>
          {canSync ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={syncing || importBusy}
              onClick={() => void syncNow(weekMonday)}
            >
              <RefreshCw
                size={14}
                className={syncing ? "spin" : ""}
                aria-hidden
              />
              {syncing ? "Sync…" : "Actualiser"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="anime-planning-week-nav" role="navigation" aria-label="Semaine">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={!canGoPrev || syncing || importBusy}
          onClick={goPrev}
          aria-label="Semaine précédente"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <p className="anime-planning-week-label">{formatWeekRangeLabel(weekMonday)}</p>
        <button
          type="button"
          className={`anime-planning-week-today-btn${isCurrentWeek ? " is-placeholder" : ""}`}
          disabled={isCurrentWeek || syncing || importBusy}
          onClick={goCurrentWeek}
          title="Revenir à la semaine actuelle"
          aria-label="Revenir à la semaine actuelle"
          aria-hidden={isCurrentWeek}
          tabIndex={isCurrentWeek ? -1 : undefined}
        >
          <RotateCcw size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={syncing || importBusy}
          onClick={goNext}
          aria-label="Semaine suivante"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      {showMappingReminder ? (
        <p className="anime-planning-banner" role="status">
          Rappel : pour lier l&apos;agenda, importez le mapping ADKami (XML avec
          series_adk_id) — idéalement une fois par mois. Le bouton « Import XML »
          accepte aussi un export liste MAL pour créer les fiches manquantes.
          {getAdkamiMappingLastImportAt()
            ? ` Dernier mapping : ${formatDateTimeFr(getAdkamiMappingLastImportAt()!)}.`
            : " Aucun mapping enregistré."}
        </p>
      ) : null}

      {mobile ? (
        <p className="anime-planning-hint" role="status">
          L&apos;agenda se synchronise au lancement de l&apos;app et à
          l&apos;ouverture de cette page (puis sur Actualiser).
        </p>
      ) : null}

      {showSyncError && syncErrorMessage ? (
        <StickyAlert
          variant="error"
          title="Erreur de synchronisation agenda"
          onDismiss={() => {
            setDismissedSyncError(true);
            clearAdkamiAgendaLastError();
          }}
        >
          {syncErrorMessage}
        </StickyAlert>
      ) : null}
      {showPageError && error ? (
        <StickyAlert
          variant="error"
          title="Erreur"
          onDismiss={() => {
            setDismissedPageError(true);
            setError(null);
          }}
        >
          {error}
        </StickyAlert>
      ) : null}
      {importInfo ? <p className="anime-planning-info">{importInfo}</p> : null}
      {lastStats ? (
        <p className="anime-planning-info">
          Agenda : {lastStats.scanned} scanné{lastStats.scanned > 1 ? "s" : ""},{" "}
          {lastStats.matched} dans votre bibliothèque
          {lastStats.linkedByTitle > 0
            ? `, ${lastStats.linkedByTitle} lié${lastStats.linkedByTitle > 1 ? "s" : ""} par titre`
            : ""}
          {lastStats.weekKey ? ` · semaine ${lastStats.weekKey}` : ""}.
        </p>
      ) : null}

      {missing.length > 0 ? (
        <section className="anime-planning-warnings reading-stats-section">
          <h2>Attention — suivi agenda incomplet</h2>
          <p className="anime-planning-hint">
            Ces séries suivies n&apos;ont pas d&apos;ID ADKami : elles ne
            peuvent pas être reliées à l&apos;agenda (importez le XML ou
            attendez un match titre).
          </p>
          <ul className="anime-planning-warning-list">
            {missing.map((anime) => (
              <li key={anime.id} className="anime-planning-warning-item">
                <span className="anime-planning-warning-title">
                  {resolveAnimeDisplayTitle(anime)}
                </span>
                <Link
                  to={`/anime/${anime.id}`}
                  className="ghost-action-btn anime-planning-warning-link"
                  title="Ouvrir la fiche détail"
                  aria-label={`Ouvrir la fiche de ${resolveAnimeDisplayTitle(anime)}`}
                >
                  <ExternalLink size={15} aria-hidden />
                  <span className="ghost-action-label">Fiche</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LoadingOverlayHost className="anime-planning-overlay-host">
        <LoadingOverlay
          visible={Boolean(overlayMessage)}
          message={overlayMessage ?? "Chargement…"}
        />
        {desktop ? (
          <AnimePlanningCalendar
            weekMonday={weekMonday}
            entries={entries}
            watchedByAnimeId={watchedByAnimeId}
          />
        ) : (
          <div className="anime-planning-days">
            {byDay.map(([day, dayEntries]) => (
              <section key={day} className="anime-planning-day">
                <h2>{day}</h2>
                {dayEntries.length === 0 ? (
                  <p className="anime-planning-day-empty">Aucune sortie</p>
                ) : (
                  <ul className="anime-planning-list">
                    {dayEntries.map((entry) => {
                      const watched = isAgendaEpisodeWatched(
                        entry.episode_number,
                        entry.anime_id
                          ? watchedByAnimeId.get(entry.anime_id)
                          : undefined,
                        entry.release_at,
                      );
                      return (
                      <li key={entry.id}>
                        <div
                          className={`anime-planning-item${watched ? " is-watched" : ""}`}
                        >
                          <div className="anime-planning-cover">
                            <CoverImage
                              url={entry.cover_url}
                              alt={entry.title}
                              variant="tile"
                              zoomable
                            />
                          </div>
                          <button
                            type="button"
                            className="anime-planning-item-body anime-planning-item-body--link"
                            disabled={!entry.anime_id}
                            onClick={() => {
                              if (!entry.anime_id) return;
                              navigate(`/anime/${entry.anime_id}`);
                            }}
                          >
                            <strong>{entry.title}</strong>
                            <span className="anime-planning-meta">
                              {formatReleaseTime(entry.release_at)}
                              {" · "}
                              {entry.episode_label ||
                                (entry.episode_number != null
                                  ? `Épisode ${entry.episode_number}`
                                  : "Épisode")}
                              {watched ? " · Vu" : ""}
                            </span>
                          </button>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </LoadingOverlayHost>
    </div>
  );
}

/**
 * @description Heure (et date courte) d'une sortie agenda.
 */
function formatReleaseTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
