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
 * @description Compare deux Map sérialisables (clés triées).
 */
export function isSameMap<K extends string, V>(
  previous: Map<K, V>,
  next: Map<K, V>,
): boolean {
  if (previous.size !== next.size) {
    return false;
  }
  const prevEntries = [...previous.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const nextEntries = [...next.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return isSameData(prevEntries, nextEntries);
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

/**
 * @description Met à jour une Map React uniquement si le contenu a changé.
 */
export function setMapIfChanged<K extends string, V>(
  setter: Dispatch<SetStateAction<Map<K, V>>>,
  next: Map<K, V>,
): boolean {
  let changed = false;
  setter((previous) => {
    if (isSameMap(previous, next)) {
      return previous;
    }
    changed = true;
    return next;
  });
  return changed;
}
