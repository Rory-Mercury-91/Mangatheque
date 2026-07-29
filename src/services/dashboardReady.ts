/**
 * @description Signale le premier chargement complet du Dashboard (UI peinte).
 * Sert à différer la séquence de sync auto de démarrage.
 */

type ReadyListener = () => void;

let dashboardReady = false;
const listeners = new Set<ReadyListener>();

/**
 * @description Indique si le Dashboard a déjà terminé son premier chargement.
 */
export function isDashboardReady(): boolean {
  return dashboardReady;
}

/**
 * @description Notifie que le Dashboard est prêt (idempotent pour la session).
 */
export function notifyDashboardReady(): void {
  if (dashboardReady) return;
  dashboardReady = true;
  for (const listener of listeners) {
    listener();
  }
  listeners.clear();
}

/**
 * @description S'abonne au premier « Dashboard prêt ».
 * Si déjà prêt, appelle le listener immédiatement (microtask).
 * @returns Fonction de désabonnement.
 */
export function onDashboardReady(listener: ReadyListener): () => void {
  if (dashboardReady) {
    queueMicrotask(listener);
    return () => undefined;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
