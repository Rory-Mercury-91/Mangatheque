import { useCallback, useEffect, useState } from "react";
import {
  readCatalogLinkOpenMode,
  subscribeCatalogLinkOpenMode,
  writeCatalogLinkOpenMode,
  type CatalogLinkOpenMode,
} from "@/services/platform/catalogLinkPreferenceService";

/**
 * @description Mode réactif d'ouverture des liens Nautiljon / catalogues.
 */
export function useCatalogLinkOpenMode(): [
  CatalogLinkOpenMode,
  (mode: CatalogLinkOpenMode) => void,
] {
  const [mode, setMode] = useState<CatalogLinkOpenMode>(() =>
    readCatalogLinkOpenMode(),
  );

  useEffect(() => subscribeCatalogLinkOpenMode(setMode), []);

  const update = useCallback((next: CatalogLinkOpenMode) => {
    writeCatalogLinkOpenMode(next);
    setMode(next);
  }, []);

  return [mode, update];
}
