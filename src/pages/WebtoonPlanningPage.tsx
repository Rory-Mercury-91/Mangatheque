import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import {
  LoadingOverlay,
  LoadingOverlayHost,
} from "@/components/common/LoadingOverlay";
import { StickyAlert } from "@/components/common/StickyAlert";
import "@/components/common/ghostActionBtn.css";
import { WebtoonPlanningCalendar } from "@/features/works/WebtoonPlanningCalendar";
import { isDesktopRuntime, isMobileRuntime } from "@/lib/platform";
import {
  catchUpAllReleaseSchedules,
  fetchWebtoonPlanningEntriesForWeek,
  type WebtoonPlanningEntry,
} from "@/services/workReleaseScheduleService";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  addWeeks,
  formatWeekRangeLabel,
  startOfWeekMonday,
  weekdayIndexFromMonday,
} from "@/utils/adkamiAgendaWeek";
import {
  formatWebtoonPlanningMeta,
  parseLocalIsoDate,
} from "@/utils/workReleaseSchedule/planningDisplay";
import { RELEASE_WEEKDAY_OPTIONS } from "@/utils/workReleaseSchedule/releaseWeekdays";
import "@/pages/ReadingStatsPage.css";
import "@/pages/AnimePlanningPage.css";

const DAY_ORDER = RELEASE_WEEKDAY_OPTIONS.map((d) => d.label);

/**
 * @description Planning hebdomadaire des sorties de chapitres (calendriers de parution).
 */
export function WebtoonPlanningPage() {
  const navigate = useNavigate();
  const desktop = isDesktopRuntime();
  const mobile = isMobileRuntime();
  const [weekMonday, setWeekMonday] = useState(() => startOfWeekMonday());
  const [entries, setEntries] = useState<WebtoonPlanningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState(false);

  const isCurrentWeek =
    weekMonday.getTime() === startOfWeekMonday().getTime();

  const reload = useCallback(async (monday: Date) => {
    setLoading(true);
    try {
      const next = await fetchWebtoonPlanningEntriesForWeek(monday);
      setEntries(next);
      setError(null);
      setDismissedError(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Chargement du planning webtoon impossible.",
      );
      setDismissedError(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(weekMonday);
  }, [weekMonday, reload]);

  const byDay = useMemo(() => {
    const groups = new Map<string, WebtoonPlanningEntry[]>();
    for (const label of DAY_ORDER) {
      groups.set(label, []);
    }
    for (const entry of entries) {
      const release = parseLocalIsoDate(entry.releaseDate);
      if (!release) {
        continue;
      }
      const index = weekdayIndexFromMonday(release, weekMonday);
      if (index == null) {
        continue;
      }
      const label = DAY_ORDER[index];
      if (!label) {
        continue;
      }
      groups.get(label)!.push(entry);
    }
    return DAY_ORDER.map((day) => [day, groups.get(day) ?? []] as const);
  }, [entries, weekMonday]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await catchUpAllReleaseSchedules();
      await reload(weekMonday);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Actualisation du planning impossible.",
      );
      setDismissedError(false);
    } finally {
      setRefreshing(false);
    }
  };

  const overlayMessage = loading
    ? "Chargement du planning…"
    : refreshing
      ? "Actualisation…"
      : null;

  const showCalendar = desktop || !mobile;

  return (
    <div className="reading-stats-page anime-planning-page">
      <header className="reading-stats-header anime-planning-header">
        <div>
          <h1>Planning webtoon</h1>
          <p className="reading-stats-subtitle">
            Sorties de chapitres prévues (calendriers de parution)
          </p>
        </div>
        <div className="anime-planning-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={loading || refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw
              size={14}
              className={refreshing ? "spin" : ""}
              aria-hidden
            />
            {refreshing ? "Sync…" : "Actualiser"}
          </button>
        </div>
      </header>

      <div
        className="anime-planning-week-nav"
        role="navigation"
        aria-label="Semaine"
      >
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={loading || refreshing}
          aria-label="Semaine précédente"
          onClick={() => setWeekMonday((prev) => addWeeks(prev, -1))}
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <p className="anime-planning-week-label">
          {formatWeekRangeLabel(weekMonday)}
        </p>
        <button
          type="button"
          className={`anime-planning-week-today-btn${isCurrentWeek ? " is-placeholder" : ""}`}
          disabled={isCurrentWeek || loading || refreshing}
          title="Revenir à cette semaine"
          aria-label="Cette semaine"
          onClick={() => setWeekMonday(startOfWeekMonday())}
        >
          <RotateCcw size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={loading || refreshing}
          aria-label="Semaine suivante"
          onClick={() => setWeekMonday((prev) => addWeeks(prev, 1))}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      {error && !dismissedError ? (
        <StickyAlert
          variant="error"
          onDismiss={() => setDismissedError(true)}
        >
          {error}
        </StickyAlert>
      ) : null}

      {!loading && entries.length === 0 ? (
        <p className="anime-planning-hint" role="status">
          Aucune sortie prévue cette semaine. Ajoutez un calendrier de parution
          sur une fiche lecture.
        </p>
      ) : null}

      <LoadingOverlayHost className="anime-planning-overlay-host">
        <LoadingOverlay
          visible={Boolean(overlayMessage)}
          message={overlayMessage ?? "Chargement…"}
        />
        {showCalendar ? (
          <WebtoonPlanningCalendar
            weekMonday={weekMonday}
            entries={entries}
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
                    {dayEntries.map((entry) => (
                      <li key={`${entry.workId}-${entry.releaseDate}`}>
                        <div className="anime-planning-item">
                          <div className="anime-planning-cover">
                            <CoverImage
                              url={entry.coverUrl}
                              alt={entry.title}
                              variant="tile"
                              zoomable
                            />
                          </div>
                          <button
                            type="button"
                            className="anime-planning-item-body anime-planning-item-body--link"
                            onClick={() => navigate(`/work/${entry.workId}`)}
                          >
                            <strong>{entry.title}</strong>
                            <span className="anime-planning-meta">
                              {formatWebtoonPlanningMeta(entry)}
                            </span>
                          </button>
                          {entry.platformLink ? (
                            <button
                              type="button"
                              className="ghost-action-btn"
                              title={
                                entry.platformLabel
                                  ? `Ouvrir ${entry.platformLabel}`
                                  : "Ouvrir la plateforme"
                              }
                              aria-label="Ouvrir la plateforme"
                              onClick={() =>
                                void openExternalUrl(entry.platformLink!)
                              }
                            >
                              <ExternalLink size={14} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
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
