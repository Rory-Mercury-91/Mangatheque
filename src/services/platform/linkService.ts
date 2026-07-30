import { invoke } from "@tauri-apps/api/core";
import { isAndroidRuntime, isDesktopRuntime, isTauriRuntime } from "@/lib/platform";
import { getPreferredBrowserOpenWith } from "@/services/platform/browserPreferenceService";
import { resolveErrorMessage } from "@/utils/errorMessage";

export interface OpenExternalOptions {
  /**
   * Si true et qu'un navigateur préféré est configuré, n'utilise pas
   * le navigateur système en secours (utile pour le bouton Tester).
   */
  strictPreferred?: boolean;
}

/**
 * @description Indique si la commande ressemble à un chemin d'exécutable.
 */
function looksLikeExecutablePath(value: string): boolean {
  return (
    /[\\/]/.test(value) ||
    /\.exe$/i.test(value) ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
}

/**
 * @description Ouvre via la commande Rust native (fiable pour les chemins Windows).
 */
async function openWithNativeApp(url: string, app: string): Promise<void> {
  await invoke("open_url_with_app", { url, app });
}

/**
 * @description Ouvre une URL dans le navigateur (préféré si configuré, sinon système).
 * @param url - Lien absolu à ouvrir.
 * @param options - Options d'ouverture.
 */
export async function openExternalUrl(
  url: string,
  options: OpenExternalOptions = {},
): Promise<void> {
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
        const attempts: Array<() => Promise<void>> = [];

        // Chemins .exe / Program Files : lancement process natif en premier.
        if (looksLikeExecutablePath(openWith)) {
          attempts.push(() => openWithNativeApp(trimmed, openWith));
        }
        attempts.push(async () => {
          await openUrl(trimmed, openWith);
        });
        // Si openWith est juste "firefox", tenter aussi le spawn natif.
        if (!looksLikeExecutablePath(openWith)) {
          attempts.push(() => openWithNativeApp(trimmed, openWith));
        }

        let lastError: unknown = null;
        for (const attempt of attempts) {
          try {
            await attempt();
            return;
          } catch (error) {
            lastError = error;
          }
        }

        const detail =
          lastError instanceof Error
            ? lastError.message
            : String(lastError ?? "");
        if (options.strictPreferred) {
          throw new Error(
            `Impossible d'ouvrir avec « ${openWith} »${detail ? ` : ${detail}` : ""}. Vérifiez le chemin ou choisissez Firefox dans la liste.`,
          );
        }
        console.warn(
          `Navigateur préféré « ${openWith} » impossible, fallback système :`,
          lastError,
        );
      }
    }

    await openUrl(trimmed);
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}

/**
 * @description Ouvre une URL dans une WebView Tauri dédiée (n'interfère pas avec Nautiljon).
 * Fallback navigateur si hors bureau / échec.
 * @param url - Lien catalogue (ex. Sushi-Scan).
 * @param title - Titre de la fenêtre.
 */
export async function openCatalogWebview(
  url: string,
  title?: string,
): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    return;
  }

  if (isTauriRuntime() && isDesktopRuntime()) {
    try {
      await invoke("open_catalog_webview", {
        url: trimmed,
        title: title?.trim() || null,
      });
      return;
    } catch (error) {
      console.warn(
        "WebView catalogue impossible, fallback navigateur :",
        resolveErrorMessage(error, "erreur"),
      );
    }
  }

  await openExternalUrl(trimmed);
}

/**
 * @description Ferme la WebView Nautiljon guidée si elle est encore ouverte.
 */
export async function closeNautiljonBrowseWindow(): Promise<void> {
  if (!isTauriRuntime() || !isDesktopRuntime()) {
    return;
  }
  try {
    await invoke("close_nautiljon_browse_window");
  } catch (error) {
    console.warn(
      "Fermeture WebView Nautiljon :",
      resolveErrorMessage(error, "ignorée"),
    );
  }
}
