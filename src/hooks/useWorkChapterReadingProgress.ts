import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchChapterProgress,
  setChapterProgress,
} from "@/services/readingProgressService";

/**
 * @description Progression chapitres lus (suivi au niveau série, compte privé).
 * @param workId - Identifiant de l'œuvre.
 * @param totalChapters - Nombre total de chapitres VF sur la fiche.
 * @param active - Active le chargement (séries chapitres sans grille détaillée).
 */
export function useWorkChapterReadingProgress(
  workId: string | undefined,
  totalChapters: number,
  active: boolean,
) {
  const { user } = useAuth();
  const [chaptersRead, setChaptersRead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const enabled = Boolean(user && workId && active && totalChapters > 0);
  const allRead = enabled && chaptersRead >= totalChapters;

  useEffect(() => {
    if (!enabled || !workId) {
      setChaptersRead(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchChapterProgress(workId)
      .then((count) => {
        if (!cancelled) {
          setChaptersRead(Math.min(count, totalChapters));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChaptersRead(0);
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
  }, [enabled, workId, totalChapters, user?.id]);

  const persist = useCallback(
    async (nextCount: number) => {
      if (!enabled || !workId) {
        return;
      }

      const previous = chaptersRead;
      setChaptersRead(Math.max(0, Math.min(nextCount, totalChapters)));
      setSaving(true);

      try {
        const saved = await setChapterProgress(workId, nextCount, totalChapters);
        setChaptersRead(saved);
      } catch {
        setChaptersRead(previous);
      } finally {
        setSaving(false);
      }
    },
    [chaptersRead, enabled, totalChapters, workId],
  );

  const markAllAsRead = useCallback(async () => {
    if (!enabled || allRead) {
      return;
    }
    await persist(totalChapters);
  }, [allRead, enabled, persist, totalChapters]);

  return {
    enabled,
    loading,
    saving,
    chaptersRead,
    totalChapters,
    allRead,
    persist,
    markAllAsRead,
  };
}
