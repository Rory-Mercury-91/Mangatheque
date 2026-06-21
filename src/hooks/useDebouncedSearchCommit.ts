import { useEffect, useRef, useState } from "react";

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * @description Saisie locale immédiate avec propagation différée (recherche bibliothèque).
 * @param committedSearch - Valeur validée côté parent (filtres appliqués).
 * @param onCommit - Appelé après le délai si le brouillon diffère de la valeur validée.
 * @param delayMs - Délai avant propagation (ms).
 * @returns Brouillon et setter pour le champ de recherche.
 */
export function useDebouncedSearchCommit(
  committedSearch: string,
  onCommit: (search: string) => void,
  delayMs = DEFAULT_DEBOUNCE_MS,
): readonly [string, (value: string) => void] {
  const [draft, setDraft] = useState(committedSearch);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    setDraft(committedSearch);
  }, [committedSearch]);

  useEffect(() => {
    if (draft === committedSearch) {
      return;
    }

    const timerId = window.setTimeout(() => {
      onCommitRef.current(draft);
    }, delayMs);

    return () => window.clearTimeout(timerId);
  }, [draft, committedSearch, delayMs]);

  return [draft, setDraft] as const;
}
