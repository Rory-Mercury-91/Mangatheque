import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { WorkChapterTotalsSnapshot } from "@/services/workService";
import {
  fetchChapterProgress,
  setChapterProgress,
} from "@/services/readingProgressService";
import { nextChapterProgressAfterIncrement } from "@/utils/chapterReadingGap";

/**
 * @description Indique si la progression chapitres est à jour du catalogue connu.
 */
function isCaughtUpWithCatalogue(
  chaptersRead: number,
  totalChapters: number,
): boolean {
  return totalChapters > 0 && chaptersRead >= totalChapters;
}

/**
 * @description Progression chapitres lus (suivi au niveau série, compte privé).
 * Affiche la valeur réelle en base ; le statut « En cours » publication empêche
 * seulement de passer en « Terminée » à 100 %.
 */
export function useWorkChapterReadingProgress(
  workId: string | undefined,
  totalChapters: number,
  active: boolean,
  onChapterTotalsExpanded?: (totals: WorkChapterTotalsSnapshot) => void,
  keepReadingGap = false,
) {
  const { user } = useAuth();
  const [chaptersRead, setChaptersRead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const enabled = Boolean(user && workId && active && totalChapters > 0);
  const displayRead = Math.min(chaptersRead, totalChapters);
  const displayTotal = totalChapters;
  const allRead =
    enabled && isCaughtUpWithCatalogue(displayRead, displayTotal);

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
          setChaptersRead(Math.max(0, count));
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
  }, [enabled, workId, user?.id]);

  const persist = useCallback(
    async (nextCount: number) => {
      if (!enabled || !workId) {
        return;
      }

      const previous = chaptersRead;
      const optimistic = Math.max(0, nextCount);
      setChaptersRead(optimistic);
      setSaving(true);

      try {
        const saved = await setChapterProgress(
          workId,
          nextCount,
          totalChapters,
          { keepReadingGap, expandCatalogue: false },
        );
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
    [
      chaptersRead,
      enabled,
      keepReadingGap,
      onChapterTotalsExpanded,
      totalChapters,
      workId,
    ],
  );

  /**
   * @description Marque tous les chapitres catalogue comme lus.
   */
  const markAllAsRead = useCallback(async () => {
    if (!enabled || allRead) {
      return;
    }
    await persist(totalChapters);
  }, [allRead, enabled, persist, totalChapters]);

  /**
   * @description Ajoute 1 chapitre lu ; relève le catalogue (+ écart) si nécessaire.
   */
  const incrementOne = useCallback(async () => {
    if (!enabled || saving || loading || !workId) {
      return;
    }

    const previous = chaptersRead;
    const next = nextChapterProgressAfterIncrement(
      chaptersRead,
      totalChapters,
      keepReadingGap,
    );

    setChaptersRead(next.chaptersRead);
    setSaving(true);

    try {
      const saved = await setChapterProgress(
        workId,
        next.chaptersRead,
        next.catalogueFloor,
        {
          keepReadingGap,
          expandCatalogue: next.expandCatalogue,
        },
      );
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
  }, [
    chaptersRead,
    enabled,
    keepReadingGap,
    loading,
    onChapterTotalsExpanded,
    saving,
    totalChapters,
    workId,
  ]);

  return {
    enabled,
    loading,
    saving,
    chaptersRead: displayRead,
    totalChapters: displayTotal,
    allRead,
    persist,
    markAllAsRead,
    incrementOne,
  };
}
