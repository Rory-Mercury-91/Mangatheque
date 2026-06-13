import { useCallback, useRef, useState } from "react";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { useImportListener, clearPendingImport } from "@/hooks/useImportListener";
import { useOwners } from "@/hooks/useOwners";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import type { ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";

/**
 * @description Écoute les imports Nautiljon/Mihon sur desktop et ouvre la modale depuis n'importe quelle page.
 */
export function DesktopImportBridge() {
  const { owners } = useOwners();
  const desktopFeatures = isDesktopFeaturesAvailable();
  const [modalOpen, setModalOpen] = useState(false);
  const [importInitial, setImportInitial] = useState<Partial<WorkFormValues>>();
  const pendingQueueRef = useRef<ScrapePayloadV1[]>([]);

  const openFromImport = useCallback(
    (payload: ScrapePayloadV1) => {
      setImportInitial(scrapePayloadToFormValues(payload, owners));
      setModalOpen(true);
    },
    [owners],
  );

  const enqueueOrOpen = useCallback(
    (payload: ScrapePayloadV1) => {
      if (modalOpen) {
        pendingQueueRef.current.push(payload);
        return;
      }
      openFromImport(payload);
    },
    [modalOpen, openFromImport],
  );

  useImportListener({
    onImport: desktopFeatures ? enqueueOrOpen : undefined,
  });

  const openNextQueued = useCallback(async () => {
    await clearPendingImport();
    const next = pendingQueueRef.current.shift();
    if (next) {
      window.setTimeout(() => openFromImport(next), 200);
    }
  }, [openFromImport]);

  const closeModal = () => {
    setModalOpen(false);
    setImportInitial(undefined);
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
      owners={owners}
      onClose={closeModal}
      onSaved={handleSaved}
    />
  );
}
