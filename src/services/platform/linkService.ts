import { isAndroidRuntime, isTauriRuntime } from "@/lib/platform";

/**
 * @description Ouvre une URL dans le navigateur système (ou Custom Tab Android).
 * @param url - Lien absolu à ouvrir.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    return;
  }

  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    // Custom Tab Android : meilleur retour vers le deep link après OAuth
    if (isAndroidRuntime()) {
      try {
        await openUrl(trimmed, "inAppBrowser");
        return;
      } catch (error) {
        console.warn(
          "Ouverture inAppBrowser impossible, fallback navigateur :",
          error,
        );
      }
    }
    await openUrl(trimmed);
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
