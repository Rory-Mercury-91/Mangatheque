import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  LocalArchiveConfirmModal,
  type LocalArchiveConfirmMode,
  type LocalArchiveConflictPolicy,
  type LocalArchiveMergeStyle,
} from "@/features/works/LocalArchiveConfirmModal";
import {
  LOCAL_ARCHIVE_INCOMPLETE_FOLDER,
  readLocalArchiveRoot,
} from "@/constants/localArchive";
import { getOwnerColor } from "@/constants/ownerColors";
import { useLinkedOwnerForUser } from "@/hooks/useLinkedOwnerForUser";
import { useOwners } from "@/hooks/useOwners";
import { isDesktopRuntime, isTauriRuntime } from "@/lib/platform";
import {
  addFilesToLocalArchive,
  canUseLocalArchives,
  inspectLocalArchivePath,
  localArchivePathExists,
  moveLocalArchive,
  openLocalArchivePath,
  pickLocalArchiveFolder,
  pickLocalArchiveSources,
  relocateLocalArchive,
} from "@/services/platform/localArchiveFsService";
import {
  deleteWorkLocalArchive,
  fetchWorkLocalArchives,
  upsertWorkLocalArchive,
  type WorkLocalArchive,
} from "@/services/workLocalArchiveService";
import { scanLinkedArchiveAndPersist } from "@/services/localArchiveScanService";
import {
  buildLocalArchivePlan,
  extractStatusFolderFromArchivePath,
  listLocalArchiveCandidatePaths,
  normalizeArchivePathKey,
  resolveForcedExpectedCount,
  type LocalArchivePlan,
} from "@/utils/localArchivePath";
import {
  buildArchiveFileRenames,
  resolveAppendRenameMappings,
  resolveArchiveRenameUnit,
  type ArchiveFileRename,
} from "@/utils/localArchiveRename";
import { formatByteSize } from "@/utils/formatByteSize";
import { resolveErrorMessage } from "@/utils/errorMessage";
import type { Work } from "@/types/database";
import "./WorkLocalArchiveSection.css";

export interface WorkLocalArchiveSectionProps {
  work: Work;
  /**
   * Résumé incomplet pour le badge header (null si complet / pas d'archive).
   */
  onIncompleteSummaryChange?: (
    summary: WorkLocalArchiveIncompleteSummary | null,
  ) => void;
}

/** Résumé condensé quand l'archive locale est incomplète. */
export interface WorkLocalArchiveIncompleteSummary {
  receivedCount: number;
  expectedCount: number;
  missingCount: number;
  unit: "volume" | "chapter";
}

/**
 * @description Section fiche : dépôt / classement d'archive locale (desktop).
 */
export function WorkLocalArchiveSection({
  work,
  onIncompleteSummaryChange,
}: WorkLocalArchiveSectionProps) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const { owners } = useOwners();
  const { linkedOwner } = useLinkedOwnerForUser();
  const [archives, setArchives] = useState<WorkLocalArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [pathExists, setPathExists] = useState<boolean | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const [pendingSources, setPendingSources] = useState<string[]>([]);
  const [pendingPlan, setPendingPlan] = useState<LocalArchivePlan | null>(null);
  const [pendingRenames, setPendingRenames] = useState<ArchiveFileRename[]>([]);
  const [pendingMode, setPendingMode] =
    useState<LocalArchiveConfirmMode>("create");
  const [sourceLabel, setSourceLabel] = useState("");
  const [destinationExists, setDestinationExists] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const desktop = canUseLocalArchives();
  const myOwnerId = linkedOwner?.id ?? null;
  const myArchive =
    archives.find((row) => row.ownerId === myOwnerId) ??
    (myOwnerId ? null : archives[0] ?? null);
  const otherArchives = archives.filter((row) => row.id !== myArchive?.id);

  const ownerName = useCallback(
    (ownerId: string | null) => {
      if (!ownerId) {
        return "Non attribué";
      }
      return owners.find((owner) => owner.id === ownerId)?.name ?? "Inconnu";
    },
    [owners],
  );

  const refreshArchive = useCallback(async () => {
    setLoading(true);
    setSectionError(null);
    try {
      let rows = await fetchWorkLocalArchives(work.id);
      let mine =
        rows.find((row) => row.ownerId === myOwnerId) ??
        (myOwnerId ? null : rows[0] ?? null);

      if (mine && desktop) {
        let exists = await localArchivePathExists(mine.rootPath);

        // Chemin DB obsolète (ex. En Cours) alors que le dossier est ailleurs
        // (ex. Incomplet) → rattacher automatiquement.
        if (!exists) {
          const staleRootPath = mine.rootPath;
          const candidates = listLocalArchiveCandidatePaths(
            work,
            readLocalArchiveRoot(),
            mine.receivedCount,
            mine.unit,
          ).filter(
            (path) =>
              normalizeArchivePathKey(path) !==
              normalizeArchivePathKey(staleRootPath),
          );

          for (const candidate of candidates) {
            if (!(await localArchivePathExists(candidate))) {
              continue;
            }
            try {
              const inspected = await inspectLocalArchivePath(candidate);
              const plan = buildLocalArchivePlan(
                work,
                readLocalArchiveRoot(),
                inspected.entryCount,
                mine.unit,
                inspected.sizeBytes,
                mine.forceComplete
                  ? resolveForcedExpectedCount(
                      inspected.entryCount,
                      mine.expectedCount,
                    )
                  : undefined,
              );
              const statusFromPath =
                extractStatusFolderFromArchivePath(candidate) ??
                plan.statusFolder;
              const saved = await upsertWorkLocalArchive({
                workId: work.id,
                ownerId: mine.ownerId ?? myOwnerId,
                rootPath: candidate,
                demographicFolder: plan.demographicFolder,
                statusFolder: statusFromPath,
                expectedCount: plan.expectedCount,
                receivedCount: inspected.entryCount,
                missingCount: plan.missingCount,
                unit: plan.unit,
                sizeBytes: inspected.sizeBytes,
                forceComplete: mine.forceComplete,
                notes: plan.note,
              });
              rows = rows.map((row) =>
                row.id === saved.id ||
                (row.workId === saved.workId && row.ownerId === saved.ownerId)
                  ? saved
                  : row,
              );
              if (!rows.some((row) => row.id === saved.id)) {
                rows = [saved, ...rows];
              }
              mine = saved;
              exists = true;
              break;
            } catch (error) {
              console.warn(
                resolveErrorMessage(
                  error,
                  "Rattachement du dossier d'archive impossible.",
                ),
              );
            }
          }
        }

        setPathExists(exists);
      } else {
        setPathExists(null);
      }

      setArchives(rows);
    } catch (error) {
      setSectionError(
        resolveErrorMessage(error, "Chargement de l'archive impossible."),
      );
    } finally {
      setLoading(false);
    }
  }, [
    work.id,
    work.title,
    work.demographic_type,
    work.reading_status,
    work.tracking_unit,
    work.has_volume_tracking,
    work.has_chapter_tracking,
    work.volumes_vf_count,
    work.volumes_vo_total,
    work.chapters_vf_count,
    work.chapters_vo_total,
    desktop,
    myOwnerId,
  ]);

  useEffect(() => {
    void refreshArchive();
  }, [refreshArchive]);

  /**
   * @description Recalcule l'attendu / manquants depuis la fiche courante
   * (et le contenu disque si possible), puis persiste si divergent.
   */
  useEffect(() => {
    if (!myArchive || loading || saving || scanning || confirmOpen) {
      return;
    }

    let cancelled = false;

    const syncFromWork = async () => {
      let receivedCount = myArchive.receivedCount;
      let sizeBytes = myArchive.sizeBytes;
      let diskOk = false;

      if (desktop && pathExists !== false) {
        try {
          const inspected = await inspectLocalArchivePath(myArchive.rootPath);
          receivedCount = inspected.entryCount;
          sizeBytes = inspected.sizeBytes;
          diskOk = true;
        } catch {
          // Conservé : compteurs stockés.
        }
      }

      if (cancelled) {
        return;
      }

      const expectedOverride = myArchive.forceComplete
        ? resolveForcedExpectedCount(receivedCount, myArchive.expectedCount)
        : undefined;
      const plan = buildLocalArchivePlan(
        work,
        readLocalArchiveRoot(),
        receivedCount,
        myArchive.unit,
        sizeBytes,
        expectedOverride,
      );
      const nextNotes = plan.note ?? null;
      const needsRelocate =
        normalizeArchivePathKey(myArchive.rootPath) !==
        normalizeArchivePathKey(plan.destinationPath);

      const unchanged =
        !needsRelocate &&
        plan.expectedCount === myArchive.expectedCount &&
        plan.missingCount === myArchive.missingCount &&
        plan.statusFolder === myArchive.statusFolder &&
        plan.demographicFolder === myArchive.demographicFolder &&
        receivedCount === myArchive.receivedCount &&
        sizeBytes === myArchive.sizeBytes &&
        (nextNotes ?? null) === (myArchive.notes ?? null);

      if (unchanged) {
        return;
      }

      try {
        const saved = diskOk
          ? await scanLinkedArchiveAndPersist({
              work,
              archive: myArchive,
              ownerId: myOwnerId,
            })
          : await upsertWorkLocalArchive({
              workId: work.id,
              ownerId: myArchive.ownerId ?? myOwnerId,
              rootPath: myArchive.rootPath,
              demographicFolder: myArchive.demographicFolder,
              statusFolder: myArchive.statusFolder,
              expectedCount: plan.expectedCount,
              receivedCount,
              missingCount: plan.missingCount,
              unit: plan.unit,
              sizeBytes,
              forceComplete: myArchive.forceComplete,
              notes: nextNotes,
            });
        if (cancelled) {
          return;
        }
        setArchives((prev) => {
          const without = prev.filter((row) => row.id !== saved.id);
          return [saved, ...without];
        });
        if (diskOk) {
          setPathExists(true);
        }
      } catch (error) {
        console.warn(
          resolveErrorMessage(
            error,
            "Synchronisation des compteurs d'archive impossible.",
          ),
        );
      }
    };

    void syncFromWork();
    return () => {
      cancelled = true;
    };
  }, [
    work.id,
    work.title,
    work.demographic_type,
    work.reading_status,
    work.tracking_unit,
    work.has_volume_tracking,
    work.has_chapter_tracking,
    work.volumes_vf_count,
    work.volumes_vo_total,
    work.chapters_vf_count,
    work.chapters_vo_total,
    myArchive?.id,
    myArchive?.ownerId,
    myArchive?.rootPath,
    myArchive?.demographicFolder,
    myArchive?.statusFolder,
    myArchive?.expectedCount,
    myArchive?.receivedCount,
    myArchive?.missingCount,
    myArchive?.unit,
    myArchive?.sizeBytes,
    myArchive?.notes,
    myArchive?.forceComplete,
    loading,
    saving,
    scanning,
    confirmOpen,
    desktop,
    pathExists,
    myOwnerId,
  ]);

  const liveArchivePlan = useMemo(() => {
    if (!myArchive) {
      return null;
    }
    const expectedOverride = myArchive.forceComplete
      ? resolveForcedExpectedCount(
          myArchive.receivedCount,
          myArchive.expectedCount,
        )
      : undefined;
    return buildLocalArchivePlan(
      work,
      readLocalArchiveRoot(),
      myArchive.receivedCount,
      myArchive.unit,
      myArchive.sizeBytes,
      expectedOverride,
    );
  }, [work, myArchive]);

  useEffect(() => {
    if (!onIncompleteSummaryChange) {
      return;
    }
    const expected =
      liveArchivePlan?.expectedCount ?? myArchive?.expectedCount ?? null;
    const received = myArchive?.receivedCount ?? 0;
    const missing =
      liveArchivePlan?.missingCount ?? myArchive?.missingCount ?? null;
    const unit = liveArchivePlan?.unit ?? myArchive?.unit ?? "volume";

    if (
      !myArchive ||
      expected == null ||
      expected <= 0 ||
      missing == null ||
      missing <= 0 ||
      received >= expected
    ) {
      onIncompleteSummaryChange(null);
      return;
    }

    onIncompleteSummaryChange({
      receivedCount: received,
      expectedCount: expected,
      missingCount: missing,
      unit,
    });
  }, [
    myArchive,
    liveArchivePlan,
    onIncompleteSummaryChange,
  ]);

  /**
   * @description Prépare la modale à partir des chemins déposés / choisis.
   */
  const prepareFromPaths = useCallback(
    async (paths: string[]) => {
      if (!desktop || paths.length === 0) {
        return;
      }
      setSectionError(null);
      setConfirmError(null);
      try {
        const inspections = await Promise.all(
          paths.map((path) => inspectLocalArchivePath(path)),
        );

        const droppingOnlyFiles = inspections.every((item) => !item.isDir);
        const mode: LocalArchiveConfirmMode =
          myArchive && droppingOnlyFiles
            ? "append"
            : myArchive
              ? "replace"
              : "create";

        const sourceEntries =
          inspections.length === 1 && inspections[0].isDir
            ? inspections[0].entries
            : inspections.map((item) => ({
                name: item.name,
                isDir: item.isDir,
              }));

        const incomingSize = inspections.reduce(
          (sum, item) => sum + (item.sizeBytes ?? 0),
          0,
        );

        let existingEntries: { name: string; isDir: boolean }[] = [];
        let existingCount = 0;
        let existingSize = 0;
        if (mode === "append" && myArchive) {
          const existing = await inspectLocalArchivePath(myArchive.rootPath);
          existingEntries = existing.entries;
          existingCount = existing.entries.length;
          existingSize = existing.sizeBytes;
        }

        const draftPlan = buildLocalArchivePlan(
          work,
          readLocalArchiveRoot(),
          sourceEntries.length,
        );
        const renameUnit = resolveArchiveRenameUnit(
          [...existingEntries, ...sourceEntries],
          myArchive?.unit ?? draftPlan.unit,
        );
        const renames = buildArchiveFileRenames(
          sourceEntries,
          renameUnit,
          existingEntries,
        );
        const addedCount =
          renames.length > 0 ? renames.length : sourceEntries.length;
        const receivedCount =
          mode === "append" ? existingCount + addedCount : addedCount;
        const sizeBytes =
          mode === "append" ? existingSize + incomingSize : incomingSize;

        const planBase = buildLocalArchivePlan(
          work,
          readLocalArchiveRoot(),
          receivedCount,
          renameUnit,
          sizeBytes,
        );
        const plan: LocalArchivePlan =
          mode === "append" && myArchive
            ? { ...planBase, destinationPath: myArchive.rootPath }
            : planBase;

        const destExists =
          mode === "append"
            ? false
            : await localArchivePathExists(plan.destinationPath);

        setPendingSources(inspections.map((item) => item.path));
        setPendingPlan(plan);
        setPendingRenames(renames);
        setPendingMode(mode);
        setDestinationExists(destExists);
        setSourceLabel(
          inspections.length === 1
            ? inspections[0].path
            : `${inspections.length} éléments`,
        );
        setConfirmOpen(true);
      } catch (error) {
        setSectionError(
          resolveErrorMessage(error, "Inspection de l'archive impossible."),
        );
      }
    },
    [desktop, work, myArchive],
  );

  useEffect(() => {
    if (!desktop || !isTauriRuntime() || !isDesktopRuntime()) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (cancelled) {
          return;
        }
        const zone = zoneRef.current;
        if (!zone) {
          return;
        }
        const rect = zone.getBoundingClientRect();
        const payload = event.payload;

        if (payload.type === "leave") {
          setDragOver(false);
          return;
        }

        if (payload.type === "over" || payload.type === "enter") {
          const scale = window.devicePixelRatio || 1;
          const x = payload.position.x / scale;
          const y = payload.position.y / scale;
          const inside =
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom;
          setDragOver(inside);
          return;
        }

        if (payload.type === "drop") {
          setDragOver(false);
          if (payload.paths.length === 0) {
            return;
          }
          void prepareFromPaths(payload.paths);
        }
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [desktop, prepareFromPaths]);

  const handlePickFolder = async () => {
    setSectionError(null);
    try {
      const path = await pickLocalArchiveFolder();
      if (path) {
        await prepareFromPaths([path]);
      }
    } catch (error) {
      setSectionError(
        resolveErrorMessage(error, "Sélection du dossier impossible."),
      );
    }
  };

  const handlePickFiles = async () => {
    setSectionError(null);
    try {
      const paths = await pickLocalArchiveSources();
      if (paths.length > 0) {
        await prepareFromPaths(paths);
      }
    } catch (error) {
      setSectionError(
        resolveErrorMessage(error, "Sélection des fichiers impossible."),
      );
    }
  };

  const handleConfirmMove = async (
    mappings: { fromName: string; toName: string }[],
    conflictPolicy?: LocalArchiveConflictPolicy,
    mergeStyle: LocalArchiveMergeStyle = "direct",
  ) => {
    if (!pendingPlan || pendingSources.length === 0) {
      return;
    }
    setSaving(true);
    setConfirmError(null);
    try {
      let renames =
        mappings.length > 0
          ? mappings.map((item) => ({
              fromName: item.fromName,
              toName: item.toName,
            }))
          : undefined;

      let finalPath = pendingPlan.destinationPath;
      let finalSize = pendingPlan.sizeBytes;
      let finalReceived = pendingPlan.receivedCount;
      let finalMissing = pendingPlan.missingCount;
      let finalExpected = pendingPlan.expectedCount;
      let finalStatusFolder = pendingPlan.statusFolder;
      let finalDemographic = pendingPlan.demographicFolder;
      let finalNotes = pendingPlan.note;
      let finalUnit = pendingPlan.unit;

      if (pendingMode === "append") {
        if (!myArchive) {
          throw new Error("Aucune archive existante pour y ajouter des fichiers.");
        }
        renames = resolveAppendRenameMappings(
          mappings,
          pendingSources,
          mergeStyle,
        );
        const added = await addFilesToLocalArchive(
          pendingSources,
          myArchive.rootPath,
          renames,
        );
        finalPath = added.path;
        finalSize = added.sizeBytes;

        const refreshed = await inspectLocalArchivePath(finalPath);
        finalReceived = refreshed.entryCount;

        const expectedOverride = myArchive.forceComplete
          ? resolveForcedExpectedCount(
              finalReceived,
              myArchive.expectedCount,
            )
          : undefined;
        const ideal = buildLocalArchivePlan(
          work,
          readLocalArchiveRoot(),
          finalReceived,
          pendingPlan.unit,
          finalSize,
          expectedOverride,
        );
        finalExpected = ideal.expectedCount;
        finalMissing = ideal.missingCount;
        finalStatusFolder = ideal.statusFolder;
        finalDemographic = ideal.demographicFolder;
        finalNotes = ideal.note;
        finalUnit = ideal.unit;

        if (
          ideal.destinationPath.replace(/\\/g, "/").toLowerCase() !==
          finalPath.replace(/\\/g, "/").toLowerCase()
        ) {
          const relocated = await relocateLocalArchive(
            finalPath,
            ideal.destinationPath,
          );
          finalPath = relocated.path;
          finalSize = relocated.sizeBytes;
        }
      } else {
        const onExisting =
          conflictPolicy ??
          (pendingMode === "replace" ? "replace" : undefined);
        const moved = await moveLocalArchive(
          pendingSources,
          pendingPlan.destinationPath,
          renames,
          onExisting,
        );
        finalPath = moved.path;
        finalSize = moved.sizeBytes;

        const refreshed = await inspectLocalArchivePath(finalPath);
        finalReceived = refreshed.entryCount;
        const ideal = buildLocalArchivePlan(
          work,
          readLocalArchiveRoot(),
          finalReceived,
          pendingPlan.unit,
          finalSize,
        );
        finalExpected = ideal.expectedCount;
        finalMissing = ideal.missingCount;
        finalStatusFolder = ideal.statusFolder;
        finalDemographic = ideal.demographicFolder;
        finalNotes = ideal.note ?? finalNotes;
        finalUnit = ideal.unit;
      }

      const saved = await upsertWorkLocalArchive({
        workId: work.id,
        ownerId: myOwnerId,
        rootPath: finalPath,
        demographicFolder: finalDemographic,
        statusFolder: finalStatusFolder,
        expectedCount: finalExpected,
        receivedCount: finalReceived,
        missingCount: finalMissing,
        unit: finalUnit,
        sizeBytes: finalSize,
        forceComplete:
          pendingMode === "append" ? Boolean(myArchive?.forceComplete) : false,
        notes: finalNotes,
      });
      setArchives((prev) => {
        const withoutMine = prev.filter((row) => row.id !== saved.id);
        const withoutSameOwner = withoutMine.filter(
          (row) =>
            !(row.workId === saved.workId && row.ownerId === saved.ownerId),
        );
        return [saved, ...withoutSameOwner];
      });
      setPathExists(true);
      setConfirmOpen(false);
      setPendingPlan(null);
      setPendingSources([]);
      setPendingRenames([]);
      setPendingMode("create");
      setDestinationExists(false);
    } catch (error) {
      setConfirmError(
        resolveErrorMessage(
          error,
          pendingMode === "append"
            ? "Ajout à l'archive impossible."
            : "Déplacement de l'archive impossible.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async () => {
    if (!myArchive) {
      return;
    }
    setSectionError(null);
    try {
      await openLocalArchivePath(myArchive.rootPath);
    } catch (error) {
      setSectionError(
        resolveErrorMessage(error, "Ouverture du dossier impossible."),
      );
      setPathExists(false);
    }
  };

  /**
   * @description Recompte les fichiers du dossier lié (ajouts / suppressions hors app).
   */
  const handleRescan = async () => {
    if (!myArchive || scanning || saving) {
      return;
    }
    setSectionError(null);
    setScanning(true);
    try {
      const saved = await scanLinkedArchiveAndPersist({
        work,
        archive: myArchive,
        ownerId: myOwnerId,
      });
      setArchives((prev) => {
        const without = prev.filter((row) => row.id !== saved.id);
        return [saved, ...without];
      });
      setPathExists(true);
    } catch (error) {
      setPathExists(false);
      setSectionError(
        resolveErrorMessage(error, "Rescan du dossier d'archive impossible."),
      );
    } finally {
      setScanning(false);
    }
  };

  /**
   * @description Fige le plafond sur les fichiers présents et sort d'Incomplet.
   */
  const handleMarkComplete = async () => {
    if (!myArchive || scanning || saving) {
      return;
    }
    setSectionError(null);
    setScanning(true);
    try {
      const saved = await scanLinkedArchiveAndPersist({
        work,
        archive: myArchive,
        ownerId: myOwnerId,
        forceComplete: true,
      });
      setArchives((prev) => {
        const without = prev.filter((row) => row.id !== saved.id);
        return [saved, ...without];
      });
      setPathExists(true);
    } catch (error) {
      setSectionError(
        resolveErrorMessage(
          error,
          "Impossible de marquer l'archive comme complète.",
        ),
      );
    } finally {
      setScanning(false);
    }
  };

  /**
   * @description Annule la complétude forcée et revient au plafond catalogue.
   */
  const handleRestoreCatalogExpected = async () => {
    if (!myArchive || scanning || saving) {
      return;
    }
    setSectionError(null);
    setScanning(true);
    try {
      const saved = await scanLinkedArchiveAndPersist({
        work,
        archive: myArchive,
        ownerId: myOwnerId,
        forceComplete: false,
      });
      setArchives((prev) => {
        const without = prev.filter((row) => row.id !== saved.id);
        return [saved, ...without];
      });
      setPathExists(true);
    } catch (error) {
      setSectionError(
        resolveErrorMessage(
          error,
          "Impossible de rétablir le plafond catalogue.",
        ),
      );
    } finally {
      setScanning(false);
    }
  };

  const handleUnlink = async () => {
    if (!myArchive) {
      return;
    }
    const ok = window.confirm(
      "Retirer le lien archive de cette fiche ? Les fichiers sur le disque ne seront pas effacés.",
    );
    if (!ok) {
      return;
    }
    setSectionError(null);
    try {
      await deleteWorkLocalArchive(work.id, myArchive.ownerId);
      setArchives((prev) => prev.filter((row) => row.id !== myArchive.id));
      setPathExists(null);
    } catch (error) {
      setSectionError(
        resolveErrorMessage(error, "Suppression du lien impossible."),
      );
    }
  };

  // Mobile / hors desktop : lecture seule si un dossier est déjà lié, sinon masqué.
  if (!desktop) {
    if (loading || archives.length === 0) {
      return null;
    }

    return (
      <section
        id="work-detail-archive"
        className="work-detail-section work-local-archive"
      >
        <h2>Archive locale</h2>
        <ul className="work-local-archive-others work-local-archive-others--readonly">
          {archives.map((row) => (
            <li key={row.id}>
              <p className="work-local-archive-path" title={row.rootPath}>
                {row.rootPath}
              </p>
              <p className="work-local-archive-meta">
                {ownerName(row.ownerId)}
                {" · "}
                {row.statusFolder}
                {" · "}
                {formatByteSize(row.sizeBytes)}
              </p>
            </li>
          ))}
        </ul>
        <p className="work-local-archive-hint">
          Consultation uniquement — gestion des dossiers sur desktop.
        </p>
      </section>
    );
  }

  const unitLabel =
    (liveArchivePlan?.unit ?? myArchive?.unit) === "chapter"
      ? "chapitres"
      : "volumes";
  const displayExpected =
    liveArchivePlan?.expectedCount ?? myArchive?.expectedCount ?? null;
  const displayReceived = myArchive?.receivedCount ?? 0;
  const displayMissing =
    liveArchivePlan?.missingCount ?? myArchive?.missingCount ?? null;
  const displayNotes = liveArchivePlan?.note ?? myArchive?.notes ?? null;
  const isForcedComplete = Boolean(myArchive?.forceComplete);
  const canMarkComplete =
    Boolean(myArchive) &&
    !isForcedComplete &&
    ((displayMissing != null && displayMissing > 0) ||
      myArchive?.statusFolder === LOCAL_ARCHIVE_INCOMPLETE_FOLDER);

  return (
    <>
      <section
        id="work-detail-archive"
        className="work-detail-section work-local-archive"
      >
        <div className="work-detail-section-header">
          <div className="work-detail-section-header-main">
            <h2>Archive locale</h2>
          </div>
          <div className="work-detail-section-actions">
            {myArchive ? (
              <>
                <button
                  type="button"
                  className="ghost-action-btn"
                  title="Ouvrir le dossier"
                  aria-label="Ouvrir le dossier d'archive"
                  disabled={scanning || saving}
                  onClick={() => void handleOpen()}
                >
                  <FolderOpen size={16} aria-hidden />
                  <span className="ghost-action-label">Ouvrir</span>
                </button>
                <button
                  type="button"
                  className="ghost-action-btn"
                  title="Rescanner le dossier (ajouts / suppressions hors app)"
                  aria-label="Rescanner le dossier d'archive"
                  disabled={scanning || saving}
                  onClick={() => void handleRescan()}
                >
                  <RefreshCw
                    size={16}
                    className={scanning ? "spin" : undefined}
                    aria-hidden
                  />
                  <span className="ghost-action-label">
                    {scanning ? "Scan…" : "Rescan"}
                  </span>
                </button>
                {canMarkComplete ? (
                  <button
                    type="button"
                    className="ghost-action-btn"
                    title="Ignorer les manquants et classer comme complet (plafond = fichiers locaux)"
                    aria-label="Marquer l'archive comme complète"
                    disabled={scanning || saving}
                    onClick={() => void handleMarkComplete()}
                  >
                    <CheckCircle2 size={16} aria-hidden />
                    <span className="ghost-action-label">Complet</span>
                  </button>
                ) : null}
                {isForcedComplete ? (
                  <button
                    type="button"
                    className="ghost-action-btn"
                    title="Revenir au plafond catalogue (peut repasser en Incomplet)"
                    aria-label="Rétablir le plafond catalogue"
                    disabled={scanning || saving}
                    onClick={() => void handleRestoreCatalogExpected()}
                  >
                    <RotateCcw size={16} aria-hidden />
                    <span className="ghost-action-label">Catalogue</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost-action-btn ghost-action-btn--danger"
                  title="Retirer le lien"
                  aria-label="Retirer le lien archive"
                  disabled={scanning || saving}
                  onClick={() => void handleUnlink()}
                >
                  <Trash2 size={16} aria-hidden />
                  <span className="ghost-action-label">Délier</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="ghost-action-btn ghost-action-btn--accent"
              title="Choisir des fichiers (PC ou tablette)"
              aria-label="Choisir des fichiers d'archive"
              disabled={scanning || saving}
              onClick={() => void handlePickFiles()}
            >
              <FilePlus2 size={16} aria-hidden />
              <span className="ghost-action-label">Fichiers</span>
            </button>
            <button
              type="button"
              className="ghost-action-btn ghost-action-btn--accent"
              title="Choisir un dossier"
              aria-label="Choisir un dossier à ranger"
              disabled={scanning || saving}
              onClick={() => void handlePickFolder()}
            >
              <FolderPlus size={16} aria-hidden />
              <span className="ghost-action-label">Dossier</span>
            </button>
          </div>
        </div>

        <div
          ref={zoneRef}
          className={[
            "work-local-archive-drop",
            !loading && !myArchive ? "is-empty" : "",
            dragOver ? "is-dragover" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {loading ? (
            <p className="work-local-archive-hint">Chargement…</p>
          ) : myArchive ? (
            <div className="work-local-archive-linked">
              <p className="work-local-archive-path" title={myArchive.rootPath}>
                {myArchive.rootPath}
              </p>
              <p className="work-local-archive-meta">
                {ownerName(myArchive.ownerId)}
                {" · "}
                {myArchive.statusFolder}
                {" · "}
                {formatByteSize(myArchive.sizeBytes)}
                {" · "}
                {displayReceived}
                {displayExpected != null ? ` / ${displayExpected}` : ""}{" "}
                {unitLabel}
                {pathExists === false ? " · introuvable sur le disque" : ""}
              </p>
              {displayNotes ? (
                <p className="work-local-archive-note">{displayNotes}</p>
              ) : null}
              {isForcedComplete ? (
                <p className="work-local-archive-force-hint" role="status">
                  Plafond local forcé — le Rescan ne recalcule pas le catalogue
                  VF. « Catalogue » pour annuler.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="work-local-archive-hint">
              Glissez-déposez un dossier ou des fichiers ici, ou utilisez
              « Fichiers » / « Dossier ». « Fichiers » fonctionne aussi depuis
              une tablette USB (copie). Classement auto : démographie + statut
              (ou incomplet).
            </p>
          )}
        </div>

        {otherArchives.length > 0 ? (
          <ul className="work-local-archive-others">
            {otherArchives.map((row) => {
              const name = ownerName(row.ownerId);
              const owner = owners.find((item) => item.id === row.ownerId);
              return (
                <li
                  key={row.id}
                  style={
                    {
                      "--owner-color": owner
                        ? getOwnerColor(owner.name)
                        : "#6b7280",
                    } as CSSProperties
                  }
                >
                  Aussi chez {name} · {formatByteSize(row.sizeBytes)}
                  {row.notes ? ` · ${row.notes}` : ""}
                </li>
              );
            })}
          </ul>
        ) : null}

        {sectionError ? (
          <p className="work-local-archive-error" role="alert">
            {sectionError}
          </p>
        ) : null}
      </section>

      <LocalArchiveConfirmModal
        open={confirmOpen}
        mode={pendingMode}
        plan={pendingPlan}
        sourceLabel={sourceLabel}
        renames={pendingRenames}
        destinationExists={destinationExists}
        saving={saving}
        error={confirmError}
        onConfirm={(mappings, conflictPolicy, mergeStyle) =>
          void handleConfirmMove(mappings, conflictPolicy, mergeStyle)
        }
        onClose={() => {
          if (saving) {
            return;
          }
          setConfirmOpen(false);
          setPendingPlan(null);
          setPendingSources([]);
          setPendingRenames([]);
          setPendingMode("create");
          setDestinationExists(false);
          setConfirmError(null);
        }}
      />
    </>
  );
}
