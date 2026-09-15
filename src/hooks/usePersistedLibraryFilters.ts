import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  clearStoredLibraryFilters,
  consumeLibraryFilterPreset,
  persistLibraryFilters,
  readStoredLibraryFilters,
  type LibraryFiltersScope,
} from "@/services/libraryFiltersPersistence";
import {
  DEFAULT_LIBRARY_FILTERS,
  mergeLibraryFilters,
  type LibraryFiltersState,
} from "@/types/libraryFilters";
import { isSameData } from "@/utils/stateSync";

export interface PersistedLibraryFilters {
  filters: LibraryFiltersState;
  hasStoredFiltersRef: MutableRefObject<boolean>;
  handleFiltersChange: (next: LibraryFiltersState) => void;
  handleSearchCommit: (search: string) => void;
  handleFiltersReset: () => void;
  persistCurrentFilters: () => void;
  replaceFilters: (next: LibraryFiltersState, shouldPersist?: boolean) => void;
}

/**
 * @description Filtres bibliothèque persistés (mémoire + localStorage).
 * Conservés entre les vues ; le bouton reset les annule explicitement.
 * @param scope - Onglet Lectures ou Anime.
 * @param userId - Identifiant auth ou null.
 * @param fallback - Socle si aucun filtre mémorisé.
 */
export function usePersistedLibraryFilters(
  scope: LibraryFiltersScope,
  userId: string | null,
  fallback: LibraryFiltersState = DEFAULT_LIBRARY_FILTERS,
): PersistedLibraryFilters {
  const [filters, setFilters] = useState<LibraryFiltersState>(() =>
    mergeLibraryFilters(fallback, readStoredLibraryFilters(userId, scope)),
  );
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const hasStoredFiltersRef = useRef(
    readStoredLibraryFilters(userId, scope) !== null,
  );
  const hydratedForUserRef = useRef<string | null>(null);

  const persist = useCallback(
    (next: LibraryFiltersState) => {
      persistLibraryFilters(userId, next, scope);
      hasStoredFiltersRef.current = true;
    },
    [scope, userId],
  );

  const applyFilters = useCallback(
    (next: LibraryFiltersState, shouldPersist = true) => {
      filtersRef.current = next;
      setFilters((previous) => (isSameData(previous, next) ? previous : next));
      if (shouldPersist) {
        persist(next);
      }
    },
    [persist],
  );

  useEffect(() => {
    const userKey = userId ?? "anonymous";
    if (hydratedForUserRef.current === userKey) {
      return;
    }
    hydratedForUserRef.current = userKey;

    const preset = consumeLibraryFilterPreset();
    if (preset) {
      hasStoredFiltersRef.current = true;
      applyFilters(mergeLibraryFilters(fallback, preset));
      return;
    }

    const stored = readStoredLibraryFilters(userId, scope);
    if (stored) {
      hasStoredFiltersRef.current = true;
      applyFilters(mergeLibraryFilters(fallback, stored), false);
      return;
    }

    hasStoredFiltersRef.current = false;
    applyFilters(mergeLibraryFilters(fallback, null), false);
  }, [applyFilters, fallback, scope, userId]);

  const replaceFilters = useCallback(
    (next: LibraryFiltersState, shouldPersist = true) => {
      applyFilters(mergeLibraryFilters(fallback, next), shouldPersist);
    },
    [applyFilters, fallback],
  );

  const handleFiltersChange = useCallback(
    (next: LibraryFiltersState) => {
      replaceFilters(next, true);
    },
    [replaceFilters],
  );

  const handleSearchCommit = useCallback(
    (search: string) => {
      const previous = filtersRef.current;
      if (previous.search === search) {
        return;
      }
      applyFilters({ ...previous, search });
    },
    [applyFilters],
  );

  const handleFiltersReset = useCallback(() => {
    clearStoredLibraryFilters(userId, scope);
    hasStoredFiltersRef.current = false;
  }, [scope, userId]);

  const persistCurrentFilters = useCallback(() => {
    persist(filtersRef.current);
  }, [persist]);

  return {
    filters,
    hasStoredFiltersRef,
    handleFiltersChange,
    handleSearchCommit,
    handleFiltersReset,
    persistCurrentFilters,
    replaceFilters,
  };
}
