import { getSupabaseClient } from "@/lib/supabaseClient";
import { logActivity } from "@/services/activityLogService";
import type { WorkReleaseSchedule } from "@/types/database";
import type { WorkReleaseScheduleFormValues } from "@/types/workForm";
import {
  catchUpReleaseSchedule,
  parseProgressAsChapterCount,
} from "@/utils/workReleaseSchedule/catchUp";
import {
  formValuesToSchedulePayload,
  isReleaseScheduleFormMeaningful,
  mapRowToWorkReleaseSchedule,
  scheduleToFormValues,
} from "@/utils/workReleaseSchedule/mappers";
import { dateToIsoLocal } from "@/utils/workReleaseSchedule/releaseWeekdays";
import { addWeeks } from "@/utils/adkamiAgendaWeek";

function isMissingTableError(message: string): boolean {
  return /work_release_schedules|does not exist|schema cache/i.test(message);
}

/**
 * @description Charge le calendrier de parution d'une œuvre.
 */
export async function fetchWorkReleaseSchedule(
  workId: string,
): Promise<WorkReleaseSchedule | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_release_schedules")
    .select("*")
    .eq("work_id", workId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message)) {
      return null;
    }
    throw new Error(
      `Impossible de charger le calendrier de parution : ${error.message}`,
    );
  }
  if (!data) {
    return null;
  }
  return mapRowToWorkReleaseSchedule(data as Record<string, unknown>);
}

/**
 * @description Charge le calendrier sous forme formulaire.
 */
export async function fetchWorkReleaseScheduleForm(
  workId: string,
): Promise<WorkReleaseScheduleFormValues | null> {
  const schedule = await fetchWorkReleaseSchedule(workId);
  return scheduleToFormValues(schedule);
}

/**
 * @description Crée ou met à jour le calendrier. Supprime si formulaire vide.
 */
export async function upsertWorkReleaseSchedule(
  workId: string,
  form: WorkReleaseScheduleFormValues | null,
): Promise<WorkReleaseSchedule | null> {
  const supabase = getSupabaseClient();

  if (!isReleaseScheduleFormMeaningful(form)) {
    const { error: deleteError } = await supabase
      .from("work_release_schedules")
      .delete()
      .eq("work_id", workId);
    if (deleteError && !isMissingTableError(deleteError.message)) {
      throw new Error(
        `Impossible de supprimer le calendrier : ${deleteError.message}`,
      );
    }
    return null;
  }

  const payload = formValuesToSchedulePayload(workId, form!);
  const { data, error } = await supabase
    .from("work_release_schedules")
    .upsert(payload, { onConflict: "work_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Impossible d'enregistrer le calendrier : ${error.message}`,
    );
  }
  return mapRowToWorkReleaseSchedule(data as Record<string, unknown>);
}

export interface ReleaseCatchUpItem {
  workId: string;
  workTitle: string;
  releasedChapters: string[];
  schedule: WorkReleaseSchedule;
}

export interface ReleaseCatchUpStats {
  checked: number;
  updated: number;
  items: ReleaseCatchUpItem[];
}

/**
 * @description Persiste une ligne de calendrier déjà rattrapée.
 */
async function persistCaughtSchedule(
  schedule: WorkReleaseSchedule,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("work_release_schedules")
    .update({
      progress_current: schedule.progress_current,
      chapter_next_release: schedule.chapter_next_release,
      date_next_release: schedule.date_next_release,
      schedule_status: schedule.schedule_status,
      updated_at: new Date().toISOString(),
    })
    .eq("work_id", schedule.work_id);

  if (error) {
    throw new Error(
      `Impossible de mettre à jour le calendrier : ${error.message}`,
    );
  }
}

/**
 * @description Aligne les compteurs VF (disponibles) — et VO si besoin —
 * sur le chapitre courant du calendrier.
 */
async function bumpWorkChapterCountsIfNeeded(
  workId: string,
  progressCurrent: string | null,
): Promise<void> {
  const count = parseProgressAsChapterCount(progressCurrent);
  if (count == null) {
    return;
  }
  const rounded = Math.floor(count);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("works")
    .select("chapters_vf_count, chapters_vo_total")
    .eq("id", workId)
    .maybeSingle();
  if (error || !data) {
    return;
  }

  const vf =
    typeof data.chapters_vf_count === "number" ? data.chapters_vf_count : null;
  const vo =
    typeof data.chapters_vo_total === "number" ? data.chapters_vo_total : null;

  const patch: Record<string, unknown> = {};
  // Chapitres VF disponibles = progression plateforme.
  if (vf == null || vf < rounded) {
    patch.chapters_vf_count = rounded;
  }
  // VO : seulement si le progrès dépasse le total connu en base.
  if (vo != null && vo < rounded) {
    patch.chapters_vo_total = rounded;
  }

  if (Object.keys(patch).length === 0) {
    return;
  }
  patch.updated_at = new Date().toISOString();
  await supabase.from("works").update(patch).eq("id", workId);
}

/**
 * @description Rattrape le calendrier d'une œuvre (fiche / formulaire).
 */
export async function catchUpWorkReleaseSchedule(
  workId: string,
  options?: { log?: boolean; workTitle?: string },
): Promise<ReleaseCatchUpItem | null> {
  const schedule = await fetchWorkReleaseSchedule(workId);
  if (!schedule) {
    return null;
  }
  const result = catchUpReleaseSchedule(schedule);
  if (!result.changed) {
    return null;
  }

  await persistCaughtSchedule(result.schedule);
  await bumpWorkChapterCountsIfNeeded(
    workId,
    result.schedule.progress_current,
  );

  const workTitle = options?.workTitle ?? "Série";
  if (options?.log !== false) {
    const lastChapter =
      result.releasedChapters[result.releasedChapters.length - 1] ??
      result.schedule.progress_current ??
      "?";
    await logActivity({
      actionType: "release_chapter_catchup",
      entityType: "work",
      entityId: workId,
      entityTitle: workTitle,
      metadata: {
        workId,
        releasedChapters: result.releasedChapters,
        chapterLabel: lastChapter,
        steps: result.steps,
        dateNextRelease: result.schedule.date_next_release,
        reachedCeiling: result.reachedCeiling,
        scheduleStatus: result.schedule.schedule_status,
      },
    });
  }

  return {
    workId,
    workTitle,
    releasedChapters: result.releasedChapters,
    schedule: result.schedule,
  };
}

/**
 * @description Rattrape tous les calendriers éligibles (démarrage).
 */
export async function catchUpAllReleaseSchedules(): Promise<ReleaseCatchUpStats> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_release_schedules")
    .select("*")
    .eq("schedule_status", "ongoing")
    .eq("chapter_control_enabled", true)
    .not("date_next_release", "is", null);

  if (error) {
    if (isMissingTableError(error.message)) {
      return { checked: 0, updated: 0, items: [] };
    }
    throw new Error(
      `Impossible de charger les calendriers : ${error.message}`,
    );
  }

  const rows = (data ?? []).map((row) =>
    mapRowToWorkReleaseSchedule(row as Record<string, unknown>),
  );
  const workIds = rows.map((row) => row.work_id);
  const titleById = new Map<string, string>();

  if (workIds.length > 0) {
    const { data: works } = await supabase
      .from("works")
      .select("id, title")
      .in("id", workIds);
    for (const work of works ?? []) {
      titleById.set(String(work.id), String(work.title ?? "Série"));
    }
  }

  const items: ReleaseCatchUpItem[] = [];
  for (const schedule of rows) {
    const result = catchUpReleaseSchedule(schedule);
    if (!result.changed) {
      continue;
    }
    await persistCaughtSchedule(result.schedule);
    await bumpWorkChapterCountsIfNeeded(
      schedule.work_id,
      result.schedule.progress_current,
    );
    const workTitle = titleById.get(schedule.work_id) ?? "Série";
    const lastChapter =
      result.releasedChapters[result.releasedChapters.length - 1] ??
      result.schedule.progress_current ??
      "?";
    await logActivity({
      actionType: "release_chapter_catchup",
      entityType: "work",
      entityId: schedule.work_id,
      entityTitle: workTitle,
      metadata: {
        workId: schedule.work_id,
        releasedChapters: result.releasedChapters,
        chapterLabel: lastChapter,
        steps: result.steps,
        dateNextRelease: result.schedule.date_next_release,
        reachedCeiling: result.reachedCeiling,
        scheduleStatus: result.schedule.schedule_status,
      },
    });
    items.push({
      workId: schedule.work_id,
      workTitle,
      releasedChapters: result.releasedChapters,
      schedule: result.schedule,
    });
  }

  return {
    checked: rows.length,
    updated: items.length,
    items,
  };
}

/** Sortie webtoon / manga prévue pour le planning hebdomadaire. */
export interface WebtoonPlanningEntry {
  workId: string;
  title: string;
  coverUrl: string | null;
  releaseDate: string;
  chapterLabel: string | null;
  platformLabel: string | null;
  platformLink: string | null;
  scheduleStatus: WorkReleaseSchedule["schedule_status"];
}

/**
 * @description Sorties de chapitres prévues dans la semaine (calendriers de parution).
 * @param weekMonday - Lundi 00:00 de la semaine affichée.
 */
export async function fetchWebtoonPlanningEntriesForWeek(
  weekMonday: Date,
): Promise<WebtoonPlanningEntry[]> {
  const supabase = getSupabaseClient();
  const start = dateToIsoLocal(weekMonday);
  const endExclusive = dateToIsoLocal(addWeeks(weekMonday, 1));

  const { data, error } = await supabase
    .from("work_release_schedules")
    .select(
      "*, works!inner(id, title, cover_url)",
    )
    .in("schedule_status", ["ongoing", "ongoing_paid"])
    .not("date_next_release", "is", null)
    .gte("date_next_release", start)
    .lt("date_next_release", endExclusive)
    .order("date_next_release", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) {
      return [];
    }
    throw new Error(
      `Impossible de charger le planning webtoon : ${error.message}`,
    );
  }

  const entries: WebtoonPlanningEntry[] = [];
  for (const row of data ?? []) {
    const schedule = mapRowToWorkReleaseSchedule(row as Record<string, unknown>);
    const work = (row as { works?: { id?: string; title?: string; cover_url?: string | null } })
      .works;
    if (!work?.id || !schedule.date_next_release) {
      continue;
    }
    entries.push({
      workId: String(work.id),
      title: String(work.title ?? "Série"),
      coverUrl: work.cover_url ?? null,
      releaseDate: schedule.date_next_release,
      chapterLabel: schedule.chapter_next_release,
      platformLabel: schedule.official_site_label,
      platformLink: schedule.official_site_link,
      scheduleStatus: schedule.schedule_status,
    });
  }
  return entries;
}
