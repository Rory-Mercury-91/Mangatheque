import { useCallback, useEffect, useRef, useState } from "react";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import {
  useImportListener,
  clearPendingImport,
  type PendingImportEnvelope,
} from "@/hooks/useImportListener";
import { useOwners } from "@/hooks/useOwners";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import { importScrapePayloadDirectly } from "@/services/importDirectService";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import type { ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";

type ImportOwnership = Pick<ScrapePayloadV1, "ownerNames" | "mihonOwnerName">;

/**
 * @description Écoute les imports Nautiljon/Mihon sur desktop et ouvre la modale depuis n'importe quelle page.
 */
export function DesktopImportBridge() {
  const { owners } = useOwners();
  const desktopFeatures = isDesktopFeaturesAvailable();
  const [modalOpen, setModalOpen] = useState(false);
  const [importInitial, setImportInitial] = useState<Partial<WorkFormValues>>();
  const [importOwnership, setImportOwnership] = useState<ImportOwnership>();
  const importPayloadRef = useRef<ScrapePayloadV1 | null>(null);
  const pendingReviewRef = useRef<ScrapePayloadV1[]>([]);
  const pendingDirectRef = useRef<ScrapePayloadV1[]>([]);
  const directProcessingRef = useRef(false);

  const openFromImport = useCallback(
    (payload: ScrapePayloadV1) => {
      importPayloadRef.current = payload;
      setImportOwnership({
        ownerNames: payload.ownerNames,
        mihonOwnerName: payload.mihonOwnerName,
      });
      setImportInitial(scrapePayloadToFormValues(payload, owners));
      setModalOpen(true);
    },
    [owners],
  );

  /** @description Réapplique l'appartenance quand la liste owners Supabase est prête. */
  useEffect(() => {
    const payload = importPayloadRef.current;
    if (!modalOpen || !payload || owners.length === 0) {
      return;
    }
    setImportInitial(scrapePayloadToFormValues(payload, owners));
  }, [modalOpen, owners]);

  const processDirectQueue = useCallback(async () => {
    if (directProcessingRef.current || owners.length === 0) {
      return;
    }

    directProcessingRef.current = true;
    try {
      while (pendingDirectRef.current.length > 0) {
        const payload = pendingDirectRef.current.shift();
        if (!payload) {
          continue;
        }

        try {
          const title = await importScrapePayloadDirectly(payload, owners);
          console.info(`Import direct réussi : « ${title} »`);
          await clearPendingImport();
        } catch (err) {
          console.error(
            "Import direct échoué :",
            err instanceof Error ? err.message : err,
          );
          await clearPendingImport();
        }
      }
    } finally {
      directProcessingRef.current = false;
    }
  }, [owners]);

  const enqueueOrOpen = useCallback(
    (envelope: PendingImportEnvelope) => {
      const mode = envelope.mode ?? "review";
      const payload = envelope.payload;

      if (mode === "direct") {
        pendingDirectRef.current.push(payload);
        void processDirectQueue();
        return;
      }

      if (modalOpen) {
        pendingReviewRef.current.push(payload);
        return;
      }
      openFromImport(payload);
    },
    [modalOpen, openFromImport, processDirectQueue],
  );

  useEffect(() => {
    if (owners.length > 0) {
      void processDirectQueue();
    }
  }, [owners, processDirectQueue]);

  useImportListener({
    onImport: desktopFeatures ? enqueueOrOpen : undefined,
  });

  const openNextQueued = useCallback(async () => {
    await clearPendingImport();
    const next = pendingReviewRef.current.shift();
    if (next) {
      window.setTimeout(() => openFromImport(next), 200);
    }
  }, [openFromImport]);

  const closeModal = () => {
    setModalOpen(false);
    setImportInitial(undefined);
    setImportOwnership(undefined);
    importPayloadRef.current = null;
    void openNextQueued();
  };

  const handleSaved = () => {
    void openNextQueued();
  };

  if (!desktopFeatures) {
    return null;
  }

  return (
    <WorkFormModal
      open={modalOpen}
      initialValues={importInitial}
      importOwnership={importOwnership}
      owners={owners}
      onClose={closeModal}
      onSaved={handleSaved}
    />
  );
}
