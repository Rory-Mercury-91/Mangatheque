import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
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

  const reloadProgress = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!enabled || !workId) {
        setIsAbandoned(false);
        setLoading(false);
        return;
      }

      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }

      try {
        const abandoned = await fetchWorkReadingAbandoned(workId);
        setIsAbandoned(abandoned);
      } catch (err) {
        console.warn("Impossible de recharger l'état abandonnée :", err);
        if (!silent) {
          setIsAbandoned(false);
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [enabled, workId],
  );

  useEffect(() => {
    void reloadProgress();
  }, [reloadProgress, user?.id]);

  useSupabaseSync(reloadProgress);

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
    reloadProgress,
  };
}
