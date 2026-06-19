import type { TrackingUnit, Work } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";

/** Profil de suivi tomes / chapitres d'une œuvre. */
export interface WorkTrackingProfile {
  hasVolumeTracking: boolean;
  hasChapterTracking: boolean;
  volumeVfCount: number | null;
  volumeVoTotal: number | null;
  chapterVfCount: number | null;
  chapterVoTotal: number | null;
  /** @deprecated Compatibilité affichage legacy. */
  trackingUnit: TrackingUnit;
}

/**
 * @description Résout le profil de suivi depuis une œuvre (colonnes hybrides ou legacy).
 */
export function resolveWorkTrackingProfile(
  work: Pick<
    Work,
    | "tracking_unit"
    | "has_volume_tracking"
    | "has_chapter_tracking"
    | "volumes_vf_count"
    | "volumes_vo_total"
    | "chapters_vf_count"
    | "chapters_vo_total"
  >,
): WorkTrackingProfile {
  const legacyChapterOnly = (work.tracking_unit ?? "volume") === "chapter";

  const hasChapterTracking =
    work.has_chapter_tracking ?? legacyChapterOnly;
  const hasVolumeTracking =
    work.has_volume_tracking ?? !legacyChapterOnly;

  return {
    hasVolumeTracking,
    hasChapterTracking,
    volumeVfCount: hasVolumeTracking ? work.volumes_vf_count : null,
    volumeVoTotal: hasVolumeTracking ? work.volumes_vo_total : null,
    chapterVfCount: hasChapterTracking
      ? work.chapters_vf_count ??
        (legacyChapterOnly ? work.volumes_vf_count : null)
      : null,
    chapterVoTotal: hasChapterTracking
      ? work.chapters_vo_total ??
        (legacyChapterOnly ? work.volumes_vo_total : null)
      : null,
    trackingUnit: hasChapterTracking && !hasVolumeTracking ? "chapter" : "volume",
  };
}

/**
 * @description Applique le profil de suivi au formulaire œuvre.
 */
export function applyTrackingProfileToFormValues(
  values: WorkFormValues,
  profile: Pick<
    WorkTrackingProfile,
    | "hasVolumeTracking"
    | "hasChapterTracking"
    | "volumeVfCount"
    | "volumeVoTotal"
    | "chapterVfCount"
    | "chapterVoTotal"
  >,
): WorkFormValues {
  return {
    ...values,
    hasVolumeTracking: profile.hasVolumeTracking,
    hasChapterTracking: profile.hasChapterTracking,
    volumesVfCount: profile.volumeVfCount,
    volumesVoTotal: profile.volumeVoTotal,
    chaptersVfCount: profile.chapterVfCount,
    chaptersVoTotal: profile.chapterVoTotal,
    trackingUnit:
      profile.hasChapterTracking && !profile.hasVolumeTracking
        ? "chapter"
        : "volume",
  };
}

/**
 * @description Libellé de section tomes/chapitres sur la fiche détail.
 */
export function formatWorkSectionTrackingTitle(
  profile: WorkTrackingProfile,
  volumeCount: number,
  chapterCount: number,
): string {
  if (profile.hasVolumeTracking && profile.hasChapterTracking) {
    return `Chapitres (${chapterCount}) – Tomes (${volumeCount})`;
  }
  if (profile.hasChapterTracking) {
    return `Chapitres (${chapterCount})`;
  }
  return `Tomes (${volumeCount})`;
}
