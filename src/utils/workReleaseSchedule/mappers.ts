import type {
  WorkReleaseSchedule,
  WorkReleaseScheduleStatus,
} from "@/types/database";
import type { WorkReleaseScheduleFormValues } from "@/types/workForm";
import { createEmptyReleaseScheduleFormValues } from "@/types/workForm";
import { parseReleaseWeekdays } from "@/utils/workReleaseSchedule/releaseWeekdays";

const STATUS_SET = new Set<WorkReleaseScheduleStatus>([
  "ongoing",
  "ongoing_paid",
  "season_pause",
  "completed",
  "abandoned",
]);

/**
 * @description Normalise une ligne Supabase vers WorkReleaseSchedule.
 */
export function mapRowToWorkReleaseSchedule(
  row: Record<string, unknown>,
): WorkReleaseSchedule {
  const statusRaw = String(row.schedule_status ?? "ongoing");
  const schedule_status = STATUS_SET.has(statusRaw as WorkReleaseScheduleStatus)
    ? (statusRaw as WorkReleaseScheduleStatus)
    : "ongoing";

  return {
    work_id: String(row.work_id),
    schedule_status,
    progress_current:
      typeof row.progress_current === "string" ? row.progress_current : null,
    chapter_next_release:
      typeof row.chapter_next_release === "string"
        ? row.chapter_next_release
        : null,
    date_next_release:
      typeof row.date_next_release === "string" ? row.date_next_release : null,
    release_weekdays: parseReleaseWeekdays(
      row.release_weekdays as string | number[] | null,
    ),
    release_monthly: Boolean(row.release_monthly),
    progress_total:
      typeof row.progress_total === "string" ? row.progress_total : null,
    date_series_end:
      typeof row.date_series_end === "string" ? row.date_series_end : null,
    date_season_end:
      typeof row.date_season_end === "string" ? row.date_season_end : null,
    season_number:
      typeof row.season_number === "string" ? row.season_number : null,
    chapter_control_enabled: row.chapter_control_enabled !== false,
    official_site_label:
      typeof row.official_site_label === "string"
        ? row.official_site_label
        : null,
    official_site_link:
      typeof row.official_site_link === "string" ? row.official_site_link : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * @description Convertit une ligne DB vers le formulaire.
 */
export function scheduleToFormValues(
  schedule: WorkReleaseSchedule | null,
): WorkReleaseScheduleFormValues | null {
  if (!schedule) {
    return null;
  }
  return {
    scheduleStatus: schedule.schedule_status,
    progressCurrent: schedule.progress_current ?? "",
    chapterNextRelease: schedule.chapter_next_release ?? "",
    dateNextRelease: schedule.date_next_release ?? "",
    releaseWeekdays: [...schedule.release_weekdays],
    releaseMonthly: schedule.release_monthly,
    progressTotal: schedule.progress_total ?? "",
    dateSeriesEnd: schedule.date_series_end ?? "",
    dateSeasonEnd: schedule.date_season_end ?? "",
    seasonNumber: schedule.season_number ?? "",
    chapterControlEnabled: schedule.chapter_control_enabled,
    officialSiteLabel: schedule.official_site_label ?? "",
    officialSiteLink: schedule.official_site_link ?? "",
  };
}

/**
 * @description True si le formulaire a au moins une info utile à persister.
 */
export function isReleaseScheduleFormMeaningful(
  form: WorkReleaseScheduleFormValues | null | undefined,
): boolean {
  if (!form) {
    return false;
  }
  return Boolean(
    form.progressCurrent.trim() ||
      form.chapterNextRelease.trim() ||
      form.dateNextRelease.trim() ||
      form.releaseWeekdays.length > 0 ||
      form.progressTotal.trim() ||
      form.dateSeriesEnd.trim() ||
      form.dateSeasonEnd.trim() ||
      form.seasonNumber.trim() ||
      form.officialSiteLabel.trim() ||
      form.officialSiteLink.trim() ||
      form.scheduleStatus !== "ongoing" ||
      form.releaseMonthly ||
      !form.chapterControlEnabled,
  );
}

/**
 * @description Prépare un formulaire vide prêt à l'édition.
 */
export function ensureReleaseScheduleForm(
  form: WorkReleaseScheduleFormValues | null,
): WorkReleaseScheduleFormValues {
  return form ?? createEmptyReleaseScheduleFormValues();
}

/**
 * @description Payload upsert depuis le formulaire.
 */
export function formValuesToSchedulePayload(
  workId: string,
  form: WorkReleaseScheduleFormValues,
): Record<string, unknown> {
  const emptyToNull = (value: string) => {
    const trimmed = value.trim();
    return trimmed || null;
  };

  return {
    work_id: workId,
    schedule_status: form.scheduleStatus,
    progress_current: emptyToNull(form.progressCurrent),
    chapter_next_release: emptyToNull(form.chapterNextRelease),
    date_next_release: emptyToNull(form.dateNextRelease),
    release_weekdays: form.releaseWeekdays,
    release_monthly: form.releaseMonthly,
    progress_total: emptyToNull(form.progressTotal),
    date_series_end: emptyToNull(form.dateSeriesEnd),
    date_season_end: emptyToNull(form.dateSeasonEnd),
    season_number: emptyToNull(form.seasonNumber),
    chapter_control_enabled: form.chapterControlEnabled,
    official_site_label: emptyToNull(form.officialSiteLabel),
    official_site_link: emptyToNull(form.officialSiteLink),
    updated_at: new Date().toISOString(),
  };
}
