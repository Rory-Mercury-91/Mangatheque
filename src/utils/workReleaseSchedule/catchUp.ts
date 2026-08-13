import type { WorkReleaseSchedule } from "@/types/database";
import {
  computeNextChapter,
  computeNextReleaseDateByMode,
  isReleaseDatePassed,
  resolveStoredDateValue,
} from "@/utils/workReleaseSchedule/releaseWeekdays";

const MAX_CATCH_UP_STEPS = 500;

/** Résultat d'un rattrapage sur une ligne de calendrier. */
export interface ReleaseScheduleCatchUpResult {
  schedule: WorkReleaseSchedule;
  steps: number;
  /** Chapitres considérés comme parus pendant le rattrapage. */
  releasedChapters: string[];
  changed: boolean;
  /** True si le plafond « total connu » a stoppé l'avancement. */
  reachedCeiling: boolean;
}

/**
 * @description Extrait un entier utilisable pour les compteurs de chapitres.
 */
export function parseProgressAsChapterCount(
  progress: string | null | undefined,
): number | null {
  const trimmed = (progress ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const m = trimmed.match(/^(\d+(?:\.\d+)?)/);
  if (!m) {
    return null;
  }
  const value = Number(m[1]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * @description Compare deux libellés de chapitre (entiers / décimaux).
 * @returns négatif si a < b, 0 si égal, positif si a > b ; null si incomparable.
 */
function compareChapterLabels(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const left = parseProgressAsChapterCount(a);
  const right = parseProgressAsChapterCount(b);
  if (left == null || right == null) {
    return null;
  }
  return left - right;
}

/**
 * @description Avance le calendrier de *parution* tant que la prochaine sortie est passée.
 * Met à jour le dernier chapitre paru, pas la lecture utilisateur.
 * S'arrête au plafond `progress_total` (total connu) s'il est renseigné.
 * Uniquement pour le statut `ongoing` avec contrôle de chapitre actif.
 */
export function catchUpReleaseSchedule(
  schedule: WorkReleaseSchedule,
): ReleaseScheduleCatchUpResult {
  if (
    schedule.schedule_status !== "ongoing" ||
    !schedule.chapter_control_enabled
  ) {
    return {
      schedule,
      steps: 0,
      releasedChapters: [],
      changed: false,
      reachedCeiling: false,
    };
  }

  const weekdays = schedule.release_weekdays ?? [];
  if (weekdays.length === 0) {
    return {
      schedule,
      steps: 0,
      releasedChapters: [],
      changed: false,
      reachedCeiling: false,
    };
  }

  const ceiling = schedule.progress_total?.trim() || null;
  const alreadyAtCeiling =
    ceiling != null &&
    compareChapterLabels(schedule.progress_current, ceiling) != null &&
    compareChapterLabels(schedule.progress_current, ceiling)! >= 0;

  if (alreadyAtCeiling) {
    return {
      schedule: {
        ...schedule,
        schedule_status: "season_pause",
      },
      steps: 0,
      releasedChapters: [],
      changed: true,
      reachedCeiling: true,
    };
  }

  let next: WorkReleaseSchedule = { ...schedule };
  const releasedChapters: string[] = [];
  let steps = 0;
  let reachedCeiling = false;

  while (steps < MAX_CATCH_UP_STEPS) {
    if (
      ceiling &&
      compareChapterLabels(next.progress_current, ceiling) != null &&
      compareChapterLabels(next.progress_current, ceiling)! >= 0
    ) {
      reachedCeiling = true;
      break;
    }

    const dateRaw = resolveStoredDateValue(next.date_next_release ?? "");
    if (!dateRaw || !isReleaseDatePassed(dateRaw)) {
      break;
    }

    const releasedCh = (
      next.chapter_next_release ||
      next.progress_current ||
      ""
    ).trim();

    // Ne pas dépasser le plafond connu (ex. total 50 → stop à 50).
    if (releasedCh && ceiling) {
      const cmp = compareChapterLabels(releasedCh, ceiling);
      if (cmp != null && cmp > 0) {
        reachedCeiling = true;
        break;
      }
    }

    const newNextDate = computeNextReleaseDateByMode(
      dateRaw,
      weekdays,
      next.release_monthly,
    );
    if (!newNextDate) {
      break;
    }

    if (releasedCh) {
      const hitCeiling =
        ceiling != null &&
        compareChapterLabels(releasedCh, ceiling) != null &&
        compareChapterLabels(releasedCh, ceiling)! >= 0;

      next = {
        ...next,
        progress_current: releasedCh,
        chapter_next_release: computeNextChapter(releasedCh),
        date_next_release: newNextDate,
        // Plafond atteint → pause de saison (l'utilisateur passera en Terminé si besoin).
        ...(hitCeiling ? { schedule_status: "season_pause" as const } : {}),
      };
      releasedChapters.push(releasedCh);

      if (hitCeiling) {
        reachedCeiling = true;
        steps += 1;
        break;
      }
    } else {
      next = {
        ...next,
        date_next_release: newNextDate,
      };
    }
    steps += 1;
  }

  // Plafond atteint sans avoir encore basculé le statut (ex. déjà au total).
  if (reachedCeiling && next.schedule_status === "ongoing") {
    next = { ...next, schedule_status: "season_pause" };
  }

  return {
    schedule: next,
    steps,
    releasedChapters,
    changed:
      steps > 0 || next.schedule_status !== schedule.schedule_status,
    reachedCeiling,
  };
}
