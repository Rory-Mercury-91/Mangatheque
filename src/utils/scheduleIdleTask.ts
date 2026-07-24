/**
 * @description Planifie une tâche après le premier paint (évite de figer le démarrage UI).
 * @param task - Travail à exécuter une fois l'interface déjà affichée.
 * @param delayMs - Délai avant lancement (défaut 2,5 s).
 * @returns Fonction d'annulation (cleanup useEffect).
 */
export function scheduleIdleTask(
  task: () => void,
  delayMs = 2500,
): () => void {
  const timerId = window.setTimeout(task, delayMs);
  return () => {
    window.clearTimeout(timerId);
  };
}
