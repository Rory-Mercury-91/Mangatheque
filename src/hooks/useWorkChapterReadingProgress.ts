import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
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
 * @description Progression chapitres lus (suivi au niveau série, compte connecté).
 * Se rafraîchit via le hub Supabase après sync tracker / écritures foyer.
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

  const reloadProgress = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!enabled || !workId) {
        setChaptersRead(0);
        setLoading(false);
        return;
      }

      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }

      try {
        const count = await fetchChapterProgress(workId);
        setChaptersRead(Math.max(0, count));
      } catch (err) {
        console.warn("Impossible de recharger la progression chapitres :", err);
        if (!silent) {
          setChaptersRead(0);
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
    reloadProgress,
  };
}
