import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchWorkReadingAbandoned,
  setWorkReadingAbandoned,
} from "@/services/readingProgressService";

/**
 * @description État « abandonnée » personnel pour une série (compte connecté).
 * @param workId - Identifiant de l'œuvre.
 */
export function useWorkReadingAbandoned(workId: string | undefined) {
  const { user } = useAuth();
  const [isAbandoned, setIsAbandoned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const enabled = Boolean(user && workId);

  useEffect(() => {
    if (!enabled || !workId) {
      setIsAbandoned(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchWorkReadingAbandoned(workId)
      .then((abandoned) => {
        if (!cancelled) {
          setIsAbandoned(abandoned);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAbandoned(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, workId, user?.id]);

  const toggleAbandoned = useCallback(
    async (next: boolean) => {
      if (!enabled || !workId || saving) {
        return;
      }

      const previous = isAbandoned;
      setIsAbandoned(next);
      setSaving(true);

      try {
        await setWorkReadingAbandoned(workId, next);
      } catch {
        setIsAbandoned(previous);
      } finally {
        setSaving(false);
      }
    },
    [enabled, isAbandoned, saving, workId],
  );

  return {
    enabled,
    loading,
    saving,
    isAbandoned,
    setAbandoned: toggleAbandoned,
  };
}
