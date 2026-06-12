import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
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
  if (!isTauriRuntime()) {
    window.close();
    return;
  }

  if (isMobileRuntime()) {
    await exit(0);
    return;
  }

  await getCurrentWindow().close();
}
