import { isAndroidRuntime, isDesktopRuntime, isTauriRuntime } from "@/lib/platform";
import { getPreferredBrowserOpenWith } from "@/services/platform/browserPreferenceService";

/**
 * @description Ouvre une URL dans le navigateur (préféré si configuré, sinon système).
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

    if (isDesktopRuntime()) {
      const openWith = getPreferredBrowserOpenWith();
      if (openWith) {
        try {
          await openUrl(trimmed, openWith);
          return;
        } catch (error) {
          console.warn(
            `Navigateur préféré « ${openWith} » impossible, fallback système :`,
            error,
          );
        }
      }
    }

    await openUrl(trimmed);
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
