import {
  getLocalArchiveStatusFolder,
  LOCAL_ARCHIVE_INCOMPLETE_FOLDER,
  LOCAL_ARCHIVE_STATUS_FOLDERS,
  type LocalArchiveUnit,
} from "@/constants/localArchive";
import type { Work, WorkReadingStatus } from "@/types/database";
import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import { resolveWorkTrackingProfile } from "@/utils/workTracking";

/** Proposition de classement d'une archive locale. */
export interface LocalArchivePlan {
  demographicFolder: string;
  statusFolder: string;
  seriesFolder: string;
  destinationPath: string;
  expectedCount: number | null;
  receivedCount: number;
  missingCount: number | null;
  unit: LocalArchiveUnit;
  isIncomplete: boolean;
  note: string | null;
  /** Taille source estimée (octets). */
  sizeBytes: number;
}

/**
 * @description Nettoie un nom pour un dossier Windows (caractères interdits).
 * @param name - Titre ou démographie brute.
 */
export function sanitizeFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned || "sans-nom";
}

/**
 * @description Joint des segments de chemin (Windows-friendly).
 */
export function joinArchivePath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/[/\\]+$/g, "").replace(/^[/\\]+/g, ""))
    .filter(Boolean)
    .join("\\");
}

/**
 * @description Choisit l'unité et le total attendu selon le suivi de la fiche.
 * Pour les chapitres comme pour les tomes : priorité au compteur VF.
 */
export function resolveExpectedArchiveCount(
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
): { unit: LocalArchiveUnit; expectedCount: number | null } {
  const profile = resolveWorkTrackingProfile(work);

  if (profile.hasVolumeTracking) {
    const expected =
      profile.volumeVfCount ?? profile.volumeVoTotal ?? null;
    return { unit: "volume", expectedCount: expected };
  }

  if (profile.hasChapterTracking) {
    // Complétude archive = plafond VF (disponible) ; le VO sert de secours.
    const expected =
      profile.chapterVfCount ?? profile.chapterVoTotal ?? null;
    return { unit: "chapter", expectedCount: expected };
  }

  return { unit: "volume", expectedCount: null };
}

/**
 * @description Calcule le chemin cible et la complétude pour une œuvre + drop.
 * @param work - Fiche série.
 * @param archiveRoot - Racine (ex. G:\01-Archives Alex).
 * @param receivedCount - Nombre d'entrées détectées dans la source.
 * @param unitOverride - Force volume/chapitre (ex. heuristique sur les noms).
 * @param sizeBytes - Poids source (octets).
 * @param expectedOverride - Plafond forcé (ignore le catalogue VF).
 */
export function buildLocalArchivePlan(
  work: Pick<
    Work,
    | "title"
    | "demographic_type"
    | "reading_status"
    | "tracking_unit"
    | "has_volume_tracking"
    | "has_chapter_tracking"
    | "volumes_vf_count"
    | "volumes_vo_total"
    | "chapters_vf_count"
    | "chapters_vo_total"
  >,
  archiveRoot: string,
  receivedCount: number,
  unitOverride?: LocalArchiveUnit,
  sizeBytes = 0,
  expectedOverride?: number | null,
): LocalArchivePlan {
  const status: WorkReadingStatus = normalizeWorkReadingStatus(
    work.reading_status,
  );
  const resolved = resolveExpectedArchiveCount(work);
  const unit = unitOverride ?? resolved.unit;

  let expectedCount = resolved.expectedCount;
  if (unitOverride && unitOverride !== resolved.unit) {
    const profile = resolveWorkTrackingProfile(work);
    expectedCount =
      unitOverride === "chapter"
        ? profile.chapterVfCount ?? profile.chapterVoTotal ?? null
        : profile.volumeVfCount ?? profile.volumeVoTotal ?? null;
  }

  if (expectedOverride != null && expectedOverride >= 0) {
    expectedCount = Math.max(0, Math.floor(expectedOverride));
  }

  const isIncomplete =
    expectedCount != null &&
    expectedCount > 0 &&
    receivedCount < expectedCount;

  const missingCount =
    expectedCount != null && expectedCount > 0
      ? Math.max(0, expectedCount - receivedCount)
      : null;

  const demographicFolder = sanitizeFolderName(
    (work.demographic_type ?? "autre").trim() || "autre",
  );
  const statusFolder = isIncomplete
    ? LOCAL_ARCHIVE_INCOMPLETE_FOLDER
    : getLocalArchiveStatusFolder(status);
  const seriesFolder = sanitizeFolderName(work.title);
  const destinationPath = joinArchivePath(
    archiveRoot,
    demographicFolder,
    statusFolder,
    seriesFolder,
  );

  let note: string | null = null;
  if (expectedOverride != null && expectedOverride >= 0 && !isIncomplete) {
    note = "Complétude forcée (plafond local).";
  } else if (isIncomplete && missingCount != null && missingCount > 0) {
    const unitLabel = unit === "chapter" ? "chapitre(s)" : "volume(s)";
    note = `${missingCount} ${unitLabel} manquant(s) (${receivedCount}/${expectedCount}).`;
  }

  return {
    demographicFolder,
    statusFolder,
    seriesFolder,
    destinationPath,
    expectedCount,
    receivedCount,
    missingCount,
    unit,
    isIncomplete,
    note,
    sizeBytes: Math.max(0, Math.floor(sizeBytes)),
  };
}

/**
 * @description Plafond effectif si complétude forcée (remonte si plus de fichiers).
 */
export function resolveForcedExpectedCount(
  receivedCount: number,
  storedExpected: number | null,
): number {
  const received = Math.max(0, Math.floor(receivedCount));
  if (storedExpected == null || Number.isNaN(storedExpected)) {
    return received;
  }
  return Math.max(received, Math.max(0, Math.floor(storedExpected)));
}

/**
 * @description Normalise un chemin Windows pour comparaison.
 */
export function normalizeArchivePathKey(path: string): string {
  return path.trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

/**
 * @description Extrait le dossier de statut depuis un chemin d'archive
 * (`…\Démographie\Statut\Série`).
 */
export function extractStatusFolderFromArchivePath(path: string): string | null {
  const parts = path
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .split("\\")
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return parts[parts.length - 2] ?? null;
}

/**
 * @description Chemins candidats où la série peut se trouver (tous les statuts).
 * Le chemin idéal (plan) est placé en tête.
 */
export function listLocalArchiveCandidatePaths(
  work: Parameters<typeof buildLocalArchivePlan>[0],
  archiveRoot: string,
  receivedCount: number,
  unitOverride?: LocalArchiveUnit,
): string[] {
  const plan = buildLocalArchivePlan(
    work,
    archiveRoot,
    receivedCount,
    unitOverride,
  );
  const ordered = [
    plan.destinationPath,
    ...LOCAL_ARCHIVE_STATUS_FOLDERS.map((statusFolder) =>
      joinArchivePath(
        archiveRoot,
        plan.demographicFolder,
        statusFolder,
        plan.seriesFolder,
      ),
    ),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of ordered) {
    const key = normalizeArchivePathKey(path);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(path);
  }
  return result;
}
