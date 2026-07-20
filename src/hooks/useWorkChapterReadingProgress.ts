import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { WorkChapterTotalsSnapshot } from "@/services/workService";
import {
  fetchChapterProgress,
  setChapterProgress,
} from "@/services/readingProgressService";

/**
 * @description Progression chapitres lus (suivi au niveau série, compte privé).
 * @param workId - Identifiant de l'œuvre.
 * @param totalChapters - Nombre total de chapitres VF sur la fiche.
 * @param active - Active le chargement (séries chapitres sans grille détaillée).
 * @param onChapterTotalsExpanded - Appelé si le catalogue VF/VO est relevé automatiquement.
 */
export function useWorkChapterReadingProgress(
  workId: string | undefined,
  totalChapters: number,
  active: boolean,
  onChapterTotalsExpanded?: (totals: WorkChapterTotalsSnapshot) => void,
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
      setChaptersRead(Math.max(0, nextCount));
      setSaving(true);

      try {
        const saved = await setChapterProgress(workId, nextCount, totalChapters);
        setChaptersRead(saved.chaptersRead);
        if (saved.chapterVfTotal > totalChapters) {
          onChapterTotalsExpanded?.({
            chapterVfCount: saved.chapterVfTotal,
            chapterVoTotal: saved.chapterVoTotal,
          });
        }
      } catch {
        setChaptersRead(previous);
      } finally {
        setSaving(false);
      }
    },
    [chaptersRead, enabled, onChapterTotalsExpanded, totalChapters, workId],
  );

  const markAllAsRead = useCallback(async () => {
    if (!enabled || allRead) {
      return;
    }
    await persist(totalChapters);
  }, [allRead, enabled, persist, totalChapters]);

  /**
   * @description Ajoute 1 chapitre lu ; relève aussi le total catalogue si déjà à jour.
   */
  const incrementOne = useCallback(async () => {
    if (!enabled || saving || loading) {
      return;
    }
    await persist(chaptersRead + 1);
  }, [chaptersRead, enabled, loading, persist, saving]);

  return {
    enabled,
    loading,
    saving,
    chaptersRead,
    totalChapters,
    allRead,
    persist,
    markAllAsRead,
    incrementOne,
  };
}
