import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchLibraryDefaultSort,
  saveLibraryDefaultSort,
} from "@/services/libraryPreferencesService";
import type { LibrarySortKey } from "@/types/libraryFilters";
import { resolveErrorMessage } from "@/utils/errorMessage";

export interface LibraryDefaultSortState {
  defaultSort: LibrarySortKey | null;
  preferencesLoaded: boolean;
  savingDefaultSort: boolean;
  saveDefaultSort: (sort: LibrarySortKey) => Promise<void>;
}

/**
 * @description Préférence de tri bibliothèque propre à chaque compte Supabase.
 */
export function useLibraryDefaultSort(): LibraryDefaultSortState {
  const { session } = useAuth();
  const [defaultSort, setDefaultSort] = useState<LibrarySortKey | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [savingDefaultSort, setSavingDefaultSort] = useState(false);

  useEffect(() => {
    if (!session) {
      setDefaultSort(null);
      setPreferencesLoaded(true);
      return;
    }

    let cancelled = false;
    setPreferencesLoaded(false);

    void fetchLibraryDefaultSort()
      .then((sort) => {
        if (!cancelled) {
          setDefaultSort(sort);
        }
      })
      .catch((error) => {
        console.error(
          "Tri par défaut bibliothèque :",
          resolveErrorMessage(error, "Chargement impossible."),
        );
        if (!cancelled) {
          setDefaultSort(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreferencesLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  const saveDefaultSort = useCallback(async (sort: LibrarySortKey) => {
    setSavingDefaultSort(true);
    try {
      await saveLibraryDefaultSort(sort);
      setDefaultSort(sort);
    } finally {
      setSavingDefaultSort(false);
    }
  }, []);

  return {
    defaultSort,
    preferencesLoaded,
    savingDefaultSort,
    saveDefaultSort,
  };
}
