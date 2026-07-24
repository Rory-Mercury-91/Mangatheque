import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import type { AnimeAgendaRow } from "@/services/adkamiAgendaSyncService";
import {
  dateForWeekday,
  weekdayIndexFromMonday,
} from "@/utils/adkamiAgendaWeek";
import { isAgendaEpisodeWatched } from "@/utils/adkamiAgendaWatched";

const DAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

export interface AnimePlanningCalendarProps {
  weekMonday: Date;
  entries: AnimeAgendaRow[];
  /** Épisodes vus par anime_id (progression MAL / locale). */
  watchedByAnimeId: Map<string, number>;
}

/**
 * @description Grille calendrier Lundi→Dimanche (bureau).
 */
export function AnimePlanningCalendar({
  weekMonday,
  entries,
  watchedByAnimeId,
}: AnimePlanningCalendarProps) {
  const navigate = useNavigate();

  const columns = DAY_LABELS.map((label, index) => {
    const dayDate = dateForWeekday(weekMonday, index);
    const dayEntries = entries
      .filter((entry) => {
        const release = new Date(entry.release_at);
        if (Number.isNaN(release.getTime())) {
          return entry.day_label?.trim() === label;
        }
        return weekdayIndexFromMonday(release, weekMonday) === index;
      })
      .sort(
        (a, b) =>
          new Date(a.release_at).getTime() - new Date(b.release_at).getTime(),
      );
    return { label, dayDate, dayEntries };
  });

  return (
    <div className="anime-planning-calendar" role="grid" aria-label="Planning semaine">
      {columns.map(({ label, dayDate, dayEntries }) => (
        <section
          key={label}
          className="anime-planning-calendar-col"
          role="gridcell"
        >
          <header className="anime-planning-calendar-col-head">
            <strong>{label}</strong>
            <span>{formatDayMonth(dayDate)}</span>
          </header>
          {dayEntries.length === 0 ? (
            <p className="anime-planning-day-empty">—</p>
          ) : (
            <ul className="anime-planning-calendar-list">
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
                      className={`anime-planning-calendar-item${watched ? " is-watched" : ""}`}
                    >
                      <div
                        className="anime-planning-cover anime-planning-cover--sm"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
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
                        <strong title={entry.title}>{entry.title}</strong>
                        <span className="anime-planning-meta">
                          {formatTimeOnly(entry.release_at)}
                          {" · "}
                          {entry.episode_label ||
                            (entry.episode_number != null
                              ? `Ép. ${entry.episode_number}`
                              : "Ép.")}
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
  );
}

/**
 * @description Jour + mois courts (ex. 27 juil.).
 */
function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/**
 * @description Heure seule HH:MM.
 */
function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
