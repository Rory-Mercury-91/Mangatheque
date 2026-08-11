import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import type { WebtoonPlanningEntry } from "@/services/workReleaseScheduleService";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  dateForWeekday,
  weekdayIndexFromMonday,
} from "@/utils/adkamiAgendaWeek";
import {
  formatWebtoonPlanningMeta,
  parseLocalIsoDate,
} from "@/utils/workReleaseSchedule/planningDisplay";
import "@/components/common/ghostActionBtn.css";

const DAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

export interface WebtoonPlanningCalendarProps {
  weekMonday: Date;
  entries: WebtoonPlanningEntry[];
}

/**
 * @description Grille calendrier Lundi→Dimanche des sorties webtoon (bureau).
 */
export function WebtoonPlanningCalendar({
  weekMonday,
  entries,
}: WebtoonPlanningCalendarProps) {
  const navigate = useNavigate();

  const columns = DAY_LABELS.map((label, index) => {
    const dayDate = dateForWeekday(weekMonday, index);
    const dayEntries = entries
      .filter((entry) => {
        const release = parseLocalIsoDate(entry.releaseDate);
        if (!release) {
          return false;
        }
        return weekdayIndexFromMonday(release, weekMonday) === index;
      })
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    return { label, dayDate, dayEntries };
  });

  return (
    <div
      className="anime-planning-calendar"
      role="grid"
      aria-label="Planning webtoon de la semaine"
    >
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
              {dayEntries.map((entry) => (
                <li key={`${entry.workId}-${entry.releaseDate}`}>
                  <div className="anime-planning-calendar-item">
                    <div
                      className="anime-planning-cover anime-planning-cover--sm"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
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
                      <strong title={entry.title}>{entry.title}</strong>
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
  );
}

/**
 * @description Jour + mois courts (ex. 27 juil.).
 */
function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
