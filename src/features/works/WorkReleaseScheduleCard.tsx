import type { WorkReleaseSchedule } from "@/types/database";
import { CalendarClock, Pencil } from "lucide-react";
import { formatDateFr } from "@/utils/dateFormat";
import { formatReleaseWeekdaysText } from "@/utils/workReleaseSchedule/releaseWeekdays";
import "@/components/common/ghostActionBtn.css";
import "./WorkReleaseScheduleCard.css";

const STATUS_LABELS: Record<WorkReleaseSchedule["schedule_status"], string> = {
  ongoing: "En cours",
  ongoing_paid: "En cours (incomplet)",
  season_pause: "En pause",
  completed: "Terminé",
  abandoned: "Abandonnée",
};

export interface WorkReleaseScheduleCardProps {
  schedule: WorkReleaseSchedule | null;
  onEdit: () => void;
}

/**
 * @description Section fiche : planning de parution des chapitres (toujours visible).
 */
export function WorkReleaseScheduleCard({
  schedule,
  onEdit,
}: WorkReleaseScheduleCardProps) {
  const daysLabel = schedule
    ? formatReleaseWeekdaysText(schedule.release_weekdays)
    : "";
  const isSchedule =
    schedule?.schedule_status === "ongoing" ||
    schedule?.schedule_status === "ongoing_paid";
  const isPause = schedule?.schedule_status === "season_pause";
  const hasSchedule = schedule != null;

  return (
    <section
      id="work-detail-release"
      className="work-detail-section work-release-card"
      aria-labelledby="work-release-card-title"
    >
      <div className="work-detail-section-header">
        <div className="work-detail-section-header-main">
          <h2 id="work-release-card-title">Parution des chapitres</h2>
        </div>
        <div className="work-detail-section-actions">
          <button
            type="button"
            className="ghost-action-btn"
            title={
              hasSchedule
                ? "Modifier le calendrier de parution"
                : "Ajouter un calendrier de parution"
            }
            aria-label={
              hasSchedule
                ? "Modifier la parution"
                : "Ajouter une parution"
            }
            onClick={onEdit}
          >
            {hasSchedule ? (
              <Pencil size={16} aria-hidden />
            ) : (
              <CalendarClock size={16} aria-hidden />
            )}
            <span className="ghost-action-label">
              {hasSchedule ? "Modifier" : "Parution"}
            </span>
          </button>
        </div>
      </div>

      {!hasSchedule ? (
        <div className="work-release-card-panel is-empty">
          <p className="work-release-card-empty">
            Aucun planning de parution
          </p>
        </div>
      ) : (
        <div className="work-release-card-panel">
          <dl className="work-release-card-meta">
            <div>
              <dt>Statut</dt>
              <dd>{STATUS_LABELS[schedule.schedule_status]}</dd>
            </div>
            {schedule.official_site_label ? (
              <div>
                <dt>Plateforme</dt>
                <dd>
                  {schedule.official_site_link ? (
                    <a
                      href={schedule.official_site_link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {schedule.official_site_label}
                    </a>
                  ) : (
                    schedule.official_site_label
                  )}
                </dd>
              </div>
            ) : null}
            {schedule.progress_current ? (
              <div>
                <dt>Dernier chapitre paru</dt>
                <dd>{schedule.progress_current}</dd>
              </div>
            ) : null}
            {isSchedule && schedule.chapter_next_release ? (
              <div>
                <dt>Prochain chapitre</dt>
                <dd>{schedule.chapter_next_release}</dd>
              </div>
            ) : null}
            {isSchedule && schedule.date_next_release ? (
              <div>
                <dt>Prochaine sortie</dt>
                <dd>{formatDateFr(schedule.date_next_release)}</dd>
              </div>
            ) : null}
            {isSchedule && daysLabel ? (
              <div>
                <dt>Rythme</dt>
                <dd>
                  {daysLabel}
                  {schedule.release_monthly ? " · mensuel" : ""}
                </dd>
              </div>
            ) : null}
            {isPause && schedule.season_number ? (
              <div>
                <dt>Saison</dt>
                <dd>{schedule.season_number}</dd>
              </div>
            ) : null}
            {isPause && schedule.date_season_end ? (
              <div>
                <dt>Fin de saison</dt>
                <dd>{formatDateFr(schedule.date_season_end)}</dd>
              </div>
            ) : null}
            {(schedule.schedule_status === "completed" ||
              schedule.schedule_status === "abandoned") &&
            schedule.date_series_end ? (
              <div>
                <dt>Date de fin</dt>
                <dd>{formatDateFr(schedule.date_series_end)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
    </section>
  );
}
