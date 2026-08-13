import { useState } from "react";
import type { WorkReleaseScheduleStatus } from "@/types/database";
import type { WorkReleaseScheduleFormValues } from "@/types/workForm";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import { DateInputWithDayOffset } from "@/features/works/DateInputWithDayOffset";
import { ReleaseWeekdaysPicker } from "@/features/works/ReleaseWeekdaysPicker";
import type { WorkMihonSource } from "@/services/mihon/workMihonSourceService";
import { openCatalogLink } from "@/services/platform/linkService";
import { formatMihonSourceDisplay } from "@/utils/mihonSourceDisplay";
import { computeNextChapter } from "@/utils/workReleaseSchedule/releaseWeekdays";
import "./WorkReleaseScheduleSection.css";

const SCHEDULE_STATUS_OPTIONS: ReadonlyArray<{
  value: WorkReleaseScheduleStatus;
  label: string;
}> = [
  { value: "ongoing", label: "En cours" },
  { value: "ongoing_paid", label: "En cours (incomplet)" },
  { value: "season_pause", label: "En pause (saison)" },
  { value: "completed", label: "Terminé" },
  { value: "abandoned", label: "Abandonnée" },
];

const PLATFORM_OTHER = "__other__";
const PLATFORM_NONE = "";

export interface WorkReleaseScheduleSectionProps {
  value: WorkReleaseScheduleFormValues;
  onChange: (next: WorkReleaseScheduleFormValues) => void;
  disabled?: boolean;
  /** Sources Mihon de la fiche (choix de plateforme). */
  mihonSources?: WorkMihonSource[];
}

/**
 * @description Résout la valeur du select plateforme (source Mihon ou autre).
 */
function resolvePlatformSelectValue(
  value: WorkReleaseScheduleFormValues,
  mihonSources: WorkMihonSource[],
): string {
  const label = value.officialSiteLabel.trim();
  const link = value.officialSiteLink.trim();
  if (!label && !link) {
    return PLATFORM_NONE;
  }
  const byLink = mihonSources.find(
    (source) =>
      (source.catalogUrl ?? "").trim() !== "" &&
      (source.catalogUrl ?? "").trim() === link,
  );
  if (byLink) {
    return byLink.id;
  }
  const byName = mihonSources.find((source) => {
    const display = formatMihonSourceDisplay(
      source.sourceId,
      source.sourceName,
    ).label;
    return (
      display === label ||
      (source.sourceName ?? "").trim() === label ||
      source.sourceId === label
    );
  });
  if (byName) {
    return byName.id;
  }
  return PLATFORM_OTHER;
}

/**
 * @description Bloc de saisie du calendrier / attente de parution plateforme.
 */
export function WorkReleaseScheduleSection({
  value,
  onChange,
  disabled = false,
  mihonSources = [],
}: WorkReleaseScheduleSectionProps) {
  const [forceOtherPlatform, setForceOtherPlatform] = useState(false);
  const status = value.scheduleStatus;
  const isOngoing = status === "ongoing";
  const isPaid = status === "ongoing_paid";
  const isSchedule = isOngoing || isPaid;
  const isPause = status === "season_pause";
  const isFinal = status === "completed" || status === "abandoned";
  const platformSelect = resolvePlatformSelectValue(value, mihonSources);
  const showCustomPlatform =
    mihonSources.length === 0 ||
    forceOtherPlatform ||
    platformSelect === PLATFORM_OTHER;
  const selectValue =
    forceOtherPlatform || platformSelect === PLATFORM_OTHER
      ? PLATFORM_OTHER
      : platformSelect;

  const patch = (partial: Partial<WorkReleaseScheduleFormValues>) => {
    onChange({ ...value, ...partial });
  };

  const onProgressCurrentChange = (raw: string) => {
    patch({
      progressCurrent: raw,
      chapterNextRelease: computeNextChapter(raw),
    });
  };

  const onPlatformSelect = (raw: string) => {
    if (raw === PLATFORM_NONE) {
      setForceOtherPlatform(false);
      patch({ officialSiteLabel: "", officialSiteLink: "" });
      return;
    }
    if (raw === PLATFORM_OTHER) {
      setForceOtherPlatform(true);
      return;
    }
    setForceOtherPlatform(false);
    const source = mihonSources.find((row) => row.id === raw);
    if (!source) {
      return;
    }
    patch({
      officialSiteLabel: formatMihonSourceDisplay(
        source.sourceId,
        source.sourceName,
      ).label,
      officialSiteLink: (source.catalogUrl ?? "").trim(),
    });
  };

  const blockTitle = isFinal
    ? "Fin de série"
    : isPause
      ? "Pause de saison"
      : "Calendrier de parution";

  return (
    <div className="work-release-schedule">
      <div className="work-release-schedule-head">
        <span className="work-release-schedule-title">{blockTitle}</span>
      </div>

      <div className="form-grid work-release-schedule-grid">
        <label className="form-field">
          <span>Statut parution</span>
          <select
            value={status}
            disabled={disabled}
            onChange={(event) =>
              patch({
                scheduleStatus: event.target.value as WorkReleaseScheduleStatus,
              })
            }
          >
            {SCHEDULE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Plateforme</span>
          {mihonSources.length > 0 ? (
            <select
              value={selectValue}
              disabled={disabled}
              onChange={(event) => onPlatformSelect(event.target.value)}
            >
              <option value={PLATFORM_NONE}>— Choisir —</option>
              {mihonSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {
                    formatMihonSourceDisplay(source.sourceId, source.sourceName)
                      .label
                  }
                </option>
              ))}
              <option value={PLATFORM_OTHER}>Autre…</option>
            </select>
          ) : (
            <input
              value={value.officialSiteLabel}
              disabled={disabled}
              placeholder="Ajoutez d’abord une source Mihon"
              onChange={(event) =>
                patch({ officialSiteLabel: event.target.value })
              }
            />
          )}
        </label>

        {showCustomPlatform ? (
          <>
            {mihonSources.length > 0 ? (
              <label className="form-field">
                <span>Nom plateforme</span>
                <input
                  value={value.officialSiteLabel}
                  disabled={disabled}
                  placeholder="Webtoon, Kakao…"
                  onChange={(event) =>
                    patch({ officialSiteLabel: event.target.value })
                  }
                />
              </label>
            ) : null}
            <label className="form-field form-field--wide">
              <span>Lien officiel</span>
              <input
                value={value.officialSiteLink}
                disabled={disabled}
                placeholder="https://…"
                onChange={(event) =>
                  patch({ officialSiteLink: event.target.value })
                }
              />
            </label>
          </>
        ) : value.officialSiteLink ? (
          <div className="form-field form-field--wide work-release-schedule-link-hint">
            <span>Lien</span>
            <button
              type="button"
              className="work-release-schedule-link-chip"
              title={value.officialSiteLink}
              disabled={disabled}
              onClick={() => {
                void openCatalogLink(
                  value.officialSiteLink,
                  value.officialSiteLabel.trim() || "Catalogue",
                );
              }}
            >
              {value.officialSiteLabel.trim() || "Ouvrir le catalogue"}
            </button>
          </div>
        ) : (
          <p className="form-field form-field--wide work-release-schedule-link-hint is-muted">
            Aucun lien catalogue sur cette source Mihon.
          </p>
        )}

        {isSchedule ? (
          <>
            <div className="form-field form-field--wide">
              <span>Jours de sortie</span>
              <div className="work-release-schedule-days-row">
                <ReleaseWeekdaysPicker
                  value={value.releaseWeekdays}
                  disabled={disabled}
                  onChange={(days) => patch({ releaseWeekdays: days })}
                />
                <div className="work-release-schedule-monthly">
                  <ToggleSwitch
                    checked={value.releaseMonthly}
                    disabled={disabled}
                    onChange={(checked) => patch({ releaseMonthly: checked })}
                  />
                  <span>Mensuel</span>
                </div>
              </div>
            </div>

            <label className="form-field">
              <span>Dernier chapitre paru</span>
              <input
                value={value.progressCurrent}
                disabled={disabled}
                inputMode="numeric"
                placeholder="131"
                aria-describedby="release-progress-current-hint"
                onChange={(event) => onProgressCurrentChange(event.target.value)}
              />
            </label>
            <p
              id="release-progress-current-hint"
              className="form-field form-field--wide work-release-schedule-link-hint is-muted"
            >
              Dernier chapitre publié sur la plateforme — distinct de « Ma lecture ».
            </p>

            <label className="form-field">
              <span>Prochain chapitre</span>
              <input
                value={value.chapterNextRelease}
                disabled={disabled}
                inputMode="numeric"
                placeholder="+1"
                onChange={(event) =>
                  patch({ chapterNextRelease: event.target.value })
                }
              />
            </label>

            <div className="form-field form-field--wide">
              <span>Date prochaine sortie</span>
              <DateInputWithDayOffset
                id="release-date-next"
                value={value.dateNextRelease}
                disabled={disabled}
                onChange={(next) => patch({ dateNextRelease: next })}
              />
            </div>

            <label className="form-field">
              <span>
                {isPaid ? "Fin de publication (opt.)" : "Total connu (opt.)"}
              </span>
              <input
                value={value.progressTotal}
                disabled={disabled}
                inputMode="numeric"
                placeholder="150"
                onChange={(event) =>
                  patch({ progressTotal: event.target.value })
                }
              />
            </label>

            {isPaid ? (
              <div className="form-field form-field--wide">
                <span>Date de fin de publication (opt.)</span>
                <DateInputWithDayOffset
                  id="release-date-series-end"
                  value={value.dateSeriesEnd}
                  disabled={disabled}
                  onChange={(next) => patch({ dateSeriesEnd: next })}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {isPause ? (
          <>
            <label className="form-field">
              <span>Dernier chapitre paru</span>
              <input
                value={value.progressCurrent}
                disabled={disabled}
                inputMode="numeric"
                onChange={(event) => onProgressCurrentChange(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Saison</span>
              <input
                value={value.seasonNumber}
                disabled={disabled}
                inputMode="numeric"
                placeholder="2"
                onChange={(event) =>
                  patch({ seasonNumber: event.target.value })
                }
              />
            </label>
            <div className="form-field form-field--wide">
              <span>Date fin de saison (opt.)</span>
              <DateInputWithDayOffset
                id="release-date-season-end"
                value={value.dateSeasonEnd}
                disabled={disabled}
                onChange={(next) => patch({ dateSeasonEnd: next })}
              />
            </div>
          </>
        ) : null}

        {isFinal ? (
          <>
            <label className="form-field">
              <span>Dernier chapitre</span>
              <input
                value={value.progressCurrent}
                disabled={disabled}
                inputMode="numeric"
                placeholder="144"
                onChange={(event) =>
                  patch({ progressCurrent: event.target.value })
                }
              />
            </label>
            <div className="form-field form-field--wide">
              <span>Date de fin (opt.)</span>
              <DateInputWithDayOffset
                id="release-date-final"
                value={value.dateSeriesEnd}
                disabled={disabled}
                onChange={(next) => patch({ dateSeriesEnd: next })}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
