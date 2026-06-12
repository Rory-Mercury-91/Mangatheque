import { useCallback, useState } from "react";
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

  const openFromImport = useCallback((payload: ScrapePayloadV1) => {
    setImportInitial(scrapePayloadToFormValues(payload));
    setModalOpen(true);
  }, []);

  useImportListener({
    onImport: desktopFeatures ? openFromImport : undefined,
  });

  const closeModal = () => {
    setModalOpen(false);
    setImportInitial(undefined);
    void clearPendingImport();
  };

  const handleSaved = () => {
    void clearPendingImport();
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
