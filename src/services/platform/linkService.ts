import { isTauriRuntime } from "@/lib/platform";

/**
 * @description Ouvre une URL dans le navigateur système (desktop) ou un nouvel onglet (web).
 * @param url - Lien absolu à ouvrir.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    return;
  }

  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(trimmed);
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
