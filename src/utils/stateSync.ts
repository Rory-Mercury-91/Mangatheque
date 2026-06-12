import type { Dispatch, SetStateAction } from "react";

/**
 * @description Compare deux valeurs sérialisables (JSON stable).
 * @param previous - Valeur actuelle.
 * @param next - Valeur candidate.
 */
export function isSameData<T>(previous: T, next: T): boolean {
  return JSON.stringify(previous) === JSON.stringify(next);
}

/**
 * @description Met à jour l'état React uniquement si les données ont changé.
 * @param setter - Setter React.
 * @param next - Nouvelle valeur.
 * @returns true si l'état a été mis à jour.
 */
export function setIfChanged<T>(
  setter: Dispatch<SetStateAction<T>>,
  next: T,
): boolean {
  let changed = false;
  setter((previous) => {
    if (isSameData(previous, next)) {
      return previous;
    }
    changed = true;
    return next;
  });
  return changed;
}
