import { useCallback, useEffect, useState } from "react";
import {
  checkForAppUpdate,
  installDesktopUpdate,
  openAndroidUpdateDownload,
  type UpdateInfo,
} from "@/services/platform/updateService";
import { isTauriRuntime } from "@/lib/platform";

/**
 * @description Verifie les mises a jour au demarrage et expose l'etat a l'UI.
 */
export function useAppUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;

    void checkForAppUpdate()
      .then((info) => {
        if (!cancelled) {
          setUpdateInfo(info);
        }
      })
      .catch((error) => {
        console.warn("Verification mise a jour impossible :", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    if (!updateInfo) {
      return;
    }

    setInstalling(true);
    try {
      if (updateInfo.kind === "desktop") {
        await installDesktopUpdate();
      } else {
        await openAndroidUpdateDownload(updateInfo.downloadUrl);
      }
    } catch (error) {
      console.error("Echec de la mise a jour :", error);
    } finally {
      setInstalling(false);
    }
  }, [updateInfo]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    updateInfo: dismissed ? null : updateInfo,
    installing,
    applyUpdate,
    dismiss,
  };
}
