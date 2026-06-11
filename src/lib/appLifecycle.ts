import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMobileRuntime, isTauriRuntime } from "@/lib/platform";

/**
 * @description Indique si les fonctions desktop (Tampermonkey, etc.) sont disponibles.
 */
export function isDesktopFeaturesAvailable(): boolean {
  return !isMobileRuntime();
}

/**
 * @description Ferme l'application native (mobile / desktop Tauri).
 */
export async function quitApplication(): Promise<void> {
  if (isTauriRuntime()) {
    await getCurrentWindow().close();
    return;
  }

  window.close();
}
