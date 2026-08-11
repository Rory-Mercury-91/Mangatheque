import { readLocalArchiveRootForOwner } from "@/constants/localArchive";
import {
  getWorkStatusLabel,
  normalizeWorkReadingStatus,
} from "@/constants/workStatus";
import {
  canUseLocalArchives,
  localArchivePathExists,
  relocateLocalArchive,
} from "@/services/platform/localArchiveFsService";
import {
  fetchWorkLocalArchive,
  upsertWorkLocalArchive,
  type WorkLocalArchive,
} from "@/services/workLocalArchiveService";
import {
  buildLocalArchivePlan,
  resolveForcedExpectedCount,
} from "@/utils/localArchivePath";
import { resolveErrorMessage } from "@/utils/errorMessage";
import type { Work, WorkReadingStatus } from "@/types/database";

/** Champs œuvre nécessaires pour recalculer le chemin d'archive. */
export type LocalArchiveRelocateWorkFields = Pick<
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
>;

export interface PrepareLocalArchiveRelocateInput {
  workId: string;
  ownerId: string | null;
  previousStatus: WorkReadingStatus;
  previousTitle: string;
  work: LocalArchiveRelocateWorkFields;
}

/** Raisons du déplacement proposé. */
export type LocalArchiveRelocateReason = "status" | "title" | "path";

/** Proposition de déplacement à confirmer en UI. */
export interface LocalArchiveRelocateOffer {
  workId: string;
  ownerId: string | null;
  archive: WorkLocalArchive;
  reasons: LocalArchiveRelocateReason[];
  fromStatusLabel: string;
  toStatusLabel: string;
  previousTitle: string;
  nextTitle: string;
  currentPath: string;
  destinationPath: string;
  demographicFolder: string;
  statusFolder: string;
  expectedCount: number | null;
  receivedCount: number;
  missingCount: number | null;
  unit: WorkLocalArchive["unit"];
  notes: string | null;
}

export type PrepareLocalArchiveRelocateResult =
  | { status: "skipped" }
  | { status: "needsConfirm"; offer: LocalArchiveRelocateOffer }
  | { status: "error"; message: string };

/**
 * @description Normalise un chemin Windows pour comparaison.
 */
function normalizePathKey(path: string): string {
  return path.trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

/**
 * @description Dernier segment d'un chemin.
 */
function pathBasename(path: string): string {
  const parts = path
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .split("\\")
    .filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * @description Prépare une proposition de déplacement après édition de fiche
 * (statut, titre, démographie…) si le chemin cible change.
 */
export async function prepareLocalArchiveRelocateAfterWorkChange(
  input: PrepareLocalArchiveRelocateInput,
): Promise<PrepareLocalArchiveRelocateResult> {
  if (!canUseLocalArchives()) {
    return { status: "skipped" };
  }

  let archive: WorkLocalArchive | null;
  try {
    archive = await fetchWorkLocalArchive(input.workId, input.ownerId);
  } catch (error) {
    return {
      status: "error",
      message: resolveErrorMessage(
        error,
        "Impossible de charger l'archive locale.",
      ),
    };
  }

  if (!archive) {
    return { status: "skipped" };
  }

  const exists = await localArchivePathExists(archive.rootPath);
  if (!exists) {
    return { status: "skipped" };
  }

  const nextStatus = normalizeWorkReadingStatus(input.work.reading_status);
  const expectedOverride = archive.forceComplete
    ? resolveForcedExpectedCount(
        archive.receivedCount,
        archive.expectedCount,
      )
    : undefined;
  const plan = buildLocalArchivePlan(
    input.work,
    readLocalArchiveRootForOwner(archive.ownerId ?? input.ownerId),
    archive.receivedCount,
    archive.unit,
    archive.sizeBytes,
    expectedOverride,
  );

  if (
    normalizePathKey(plan.destinationPath) ===
    normalizePathKey(archive.rootPath)
  ) {
    return { status: "skipped" };
  }

  const reasons: LocalArchiveRelocateReason[] = [];
  const statusChanged = nextStatus !== input.previousStatus;
  const titleChanged =
    input.previousTitle.trim().localeCompare(input.work.title.trim(), "fr", {
      sensitivity: "accent",
    }) !== 0;
  const seriesFolderChanged =
    pathBasename(archive.rootPath).localeCompare(
      pathBasename(plan.destinationPath),
      "fr",
      { sensitivity: "accent" },
    ) !== 0;

  if (statusChanged) {
    reasons.push("status");
  }
  if (titleChanged || seriesFolderChanged) {
    reasons.push("title");
  }
  if (reasons.length === 0) {
    reasons.push("path");
  }

  return {
    status: "needsConfirm",
    offer: {
      workId: input.workId,
      ownerId: archive.ownerId ?? input.ownerId,
      archive,
      reasons,
      fromStatusLabel: getWorkStatusLabel(input.previousStatus),
      toStatusLabel: getWorkStatusLabel(nextStatus),
      previousTitle: input.previousTitle.trim(),
      nextTitle: input.work.title.trim(),
      currentPath: archive.rootPath,
      destinationPath: plan.destinationPath,
      demographicFolder: plan.demographicFolder,
      statusFolder: plan.statusFolder,
      expectedCount: plan.expectedCount,
      receivedCount: plan.receivedCount,
      missingCount: plan.missingCount,
      unit: plan.unit,
      notes: plan.note ?? archive.notes,
    },
  };
}

/** @deprecated Utiliser prepareLocalArchiveRelocateAfterWorkChange. */
export const prepareLocalArchiveRelocateAfterStatusChange =
  prepareLocalArchiveRelocateAfterWorkChange;

/**
 * @description Exécute le déplacement confirmé et met à jour la fiche archive.
 */
export async function executeLocalArchiveRelocate(
  offer: LocalArchiveRelocateOffer,
): Promise<WorkLocalArchive> {
  const moved = await relocateLocalArchive(
    offer.currentPath,
    offer.destinationPath,
  );
  return upsertWorkLocalArchive({
    workId: offer.workId,
    ownerId: offer.ownerId,
    rootPath: moved.path,
    demographicFolder: offer.demographicFolder,
    statusFolder: offer.statusFolder,
    expectedCount: offer.expectedCount,
    receivedCount: offer.receivedCount,
    missingCount: offer.missingCount,
    unit: offer.unit,
    sizeBytes: moved.sizeBytes,
    forceComplete: offer.archive.forceComplete,
    notes: offer.notes,
  });
}
