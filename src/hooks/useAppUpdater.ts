import { useCallback, useEffect, useState } from "react";
import {
  checkForAppUpdate,
  installDesktopUpdate,
  openAndroidUpdateDownload,
  type UpdateInfo,
} from "@/services/platform/updateService";
import { isTauriRuntime } from "@/lib/platform";

/** Intervalle entre deux vérifications automatiques de mise à jour. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const DISMISSED_UPDATE_VERSION_KEY = "mangatheque_dismissed_update_version";

/**
 * @description Lit la version de MAJ ignorée par l'utilisateur (localStorage).
 */
function readDismissedUpdateVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * @description Mémorise la version de MAJ ignorée par l'utilisateur.
 * @param version - Numéro de version masqué (ex. 1.1.52).
 */
function persistDismissedUpdateVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, version);
  } catch {
    // Ignoré si le stockage local est indisponible.
  }
}

/**
 * @description Vérifie les mises a jour au démarrage, au retour au premier plan et toutes les heures.
 */
export function useAppUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    readDismissedUpdateVersion(),
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;

    const runCheck = () => {
      void checkForAppUpdate()
        .then((info) => {
          if (!cancelled) {
            setUpdateInfo(info);
          }
        })
        .catch((error) => {
          console.warn("Verification mise a jour impossible :", error);
        });
    };

    runCheck();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        runCheck();
      }
    }, UPDATE_CHECK_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runCheck();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
    if (updateInfo?.version) {
      persistDismissedUpdateVersion(updateInfo.version);
      setDismissedVersion(updateInfo.version);
    }
  }, [updateInfo?.version]);

  const visibleUpdateInfo =
    updateInfo && updateInfo.version !== dismissedVersion ? updateInfo : null;

  return {
    updateInfo: visibleUpdateInfo,
    installing,
    applyUpdate,
    dismiss,
  };
}
