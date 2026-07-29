import { useCallback, useEffect, useState } from "react";
import {
  readBrowserPreference,
  subscribeBrowserPreference,
  writeBrowserPreference,
  type BrowserPreference,
  type PreferredBrowserId,
} from "@/services/platform/browserPreferenceService";

/**
 * @description Préférence réactive du navigateur pour les liens externes.
 */
export function useBrowserPreference(): [
  BrowserPreference,
  (next: BrowserPreference) => void,
] {
  const [pref, setPref] = useState<BrowserPreference>(() =>
    readBrowserPreference(),
  );

  useEffect(() => subscribeBrowserPreference(setPref), []);

  const update = useCallback((next: BrowserPreference) => {
    writeBrowserPreference(next);
    setPref({
      id: next.id,
      customCommand: next.customCommand.trim(),
    });
  }, []);

  return [pref, update];
}

/**
 * @description Raccourci pour changer uniquement l'identifiant navigateur.
 */
export function usePreferredBrowserId(): [
  PreferredBrowserId,
  (id: PreferredBrowserId) => void,
] {
  const [pref, setPref] = useBrowserPreference();
  const setId = useCallback(
    (id: PreferredBrowserId) => {
      setPref({ ...pref, id });
    },
    [pref, setPref],
  );
  return [pref.id, setId];
}
