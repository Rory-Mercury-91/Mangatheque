import { isTauriRuntime } from "@/lib/platform";

export interface OsNotificationPayload {
  title: string;
  body: string;
}

let permissionRequested = false;

/**
 * @description Demande la permission notifications (une fois) si runtime Tauri.
 */
async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  try {
    const {
      isPermissionGranted,
      requestPermission,
    } = await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted && !permissionRequested) {
      permissionRequested = true;
      const result = await requestPermission();
      granted = result === "granted";
    }
    return granted;
  } catch (error) {
    console.warn(
      "Notifications OS indisponibles :",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * @description Affiche une notification système (Desktop / Android). No-op hors Tauri.
 */
export async function showOsNotification(
  payload: OsNotificationPayload,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  const granted = await ensureNotificationPermission();
  if (!granted) {
    return;
  }
  try {
    const { sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    sendNotification({
      title: payload.title,
      body: payload.body,
    });
  } catch (error) {
    console.warn(
      "Envoi notification OS impossible :",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * @description Notifie les chapitres rattrapés (résumé ou détail si ≤ 3).
 */
export async function notifyReleaseCatchUp(items: Array<{
  workTitle: string;
  releasedChapters: string[];
}>): Promise<void> {
  if (items.length === 0) {
    return;
  }

  if (items.length <= 3) {
    for (const item of items) {
      const last =
        item.releasedChapters[item.releasedChapters.length - 1] ?? "?";
      const body =
        item.releasedChapters.length > 1
          ? `${item.releasedChapters.length} chapitres (jusqu’au ${last})`
          : `Chapitre ${last} paru`;
      await showOsNotification({
        title: item.workTitle,
        body,
      });
    }
    return;
  }

  await showOsNotification({
    title: "Parutions webtoon",
    body: `${items.length} séries ont de nouveaux chapitres.`,
  });
}
