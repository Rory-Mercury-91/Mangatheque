import { readLocalArchiveRootForOwner } from "@/constants/localArchive";
import {
  inspectLocalArchivePath,
  localArchivePathExists,
  relocateLocalArchive,
} from "@/services/platform/localArchiveFsService";
import {
  upsertWorkLocalArchive,
  type WorkLocalArchive,
} from "@/services/workLocalArchiveService";
import {
  buildLocalArchivePlan,
  normalizeArchivePathKey,
  resolveForcedExpectedCount,
} from "@/utils/localArchivePath";
import type { Work } from "@/types/database";

/**
 * @description Recompte le dossier lié et persiste (déplace si le classement change).
 * @throws Si le chemin est introuvable ou l'inspection échoue.
 */
export async function scanLinkedArchiveAndPersist(params: {
  work: Work;
  archive: WorkLocalArchive;
  ownerId: string | null;
  /** Force ou annule la complétude forcée ; défaut = valeur archive. */
  forceComplete?: boolean;
}): Promise<WorkLocalArchive> {
  const { work, archive, ownerId } = params;
  const forceComplete = params.forceComplete ?? archive.forceComplete;
  const exists = await localArchivePathExists(archive.rootPath);
  if (!exists) {
    throw new Error("Dossier d'archive introuvable sur le disque.");
  }

  const inspected = await inspectLocalArchivePath(archive.rootPath);
  const becomingForced = forceComplete && !archive.forceComplete;
  const expectedOverride = forceComplete
    ? becomingForced
      ? inspected.entryCount
      : resolveForcedExpectedCount(
          inspected.entryCount,
          archive.expectedCount,
        )
    : undefined;
  const plan = buildLocalArchivePlan(
    work,
    readLocalArchiveRootForOwner(archive.ownerId ?? ownerId),
    inspected.entryCount,
    archive.unit,
    inspected.sizeBytes,
    expectedOverride,
  );

  let rootPath = archive.rootPath;
  let sizeBytes = inspected.sizeBytes;
  let statusFolder = plan.statusFolder;
  let demographicFolder = plan.demographicFolder;

  if (
    normalizeArchivePathKey(rootPath) !==
    normalizeArchivePathKey(plan.destinationPath)
  ) {
    try {
      const relocated = await relocateLocalArchive(
        rootPath,
        plan.destinationPath,
      );
      rootPath = relocated.path;
      sizeBytes = relocated.sizeBytes;
    } catch {
      statusFolder = archive.statusFolder;
      demographicFolder = archive.demographicFolder;
    }
  }

  return upsertWorkLocalArchive({
    workId: work.id,
    ownerId: archive.ownerId ?? ownerId,
    rootPath,
    demographicFolder,
    statusFolder,
    expectedCount: plan.expectedCount,
    receivedCount: inspected.entryCount,
    missingCount: plan.missingCount,
    unit: plan.unit,
    sizeBytes,
    forceComplete,
    notes: plan.note,
  });
}
