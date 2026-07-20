import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { WorkChapterTotalsSnapshot } from "@/services/workService";
import {
  fetchChapterProgress,
  setChapterProgress,
} from "@/services/readingProgressService";
import {
  applyOngoingChapterReadingGap,
  nextChapterProgressAfterIncrement,
} from "@/utils/chapterReadingGap";

/**
 * @description Indique si la progression chapitres est à jour du catalogue connu.
 * @param chaptersRead - Chapitres lus (déjà éventuellement ajustés).
 * @param totalChapters - Total catalogue.
 * @param keepReadingGap - Série En cours (écart d'1 chapitre).
 */
function isCaughtUpWithCatalogue(
  chaptersRead: number,
  totalChapters: number,
  keepReadingGap: boolean,
): boolean {
  if (totalChapters <= 0 || chaptersRead <= 0) {
    return false;
  }
  if (keepReadingGap) {
    return chaptersRead >= totalChapters - 1;
  }
  return chaptersRead >= totalChapters;
}

/**
 * @description Progression chapitres lus (suivi au niveau série, compte privé).
 * @param workId - Identifiant de l'œuvre.
 * @param totalChapters - Nombre total de chapitres VF sur la fiche.
 * @param active - Active le chargement (séries chapitres sans grille détaillée).
 * @param onChapterTotalsExpanded - Appelé si le catalogue VF/VO est relevé automatiquement.
 * @param keepReadingGap - Série En cours : garder 1 d'écart lu / catalogue.
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
  const displayProgress = keepReadingGap
    ? applyOngoingChapterReadingGap(chaptersRead, totalChapters)
    : {
        chaptersRead,
        chaptersTotal: totalChapters,
      };
  const displayRead = displayProgress.chaptersRead;
  const displayTotal = displayProgress.chaptersTotal;
  const allRead =
    enabled &&
    isCaughtUpWithCatalogue(displayRead, displayTotal, keepReadingGap);

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
          if (keepReadingGap) {
            setChaptersRead(
              applyOngoingChapterReadingGap(count, totalChapters).chaptersRead,
            );
          } else {
            setChaptersRead(Math.min(count, totalChapters));
          }
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
  }, [enabled, keepReadingGap, workId, totalChapters, user?.id]);

  const persist = useCallback(
    async (nextCount: number) => {
      if (!enabled || !workId) {
        return;
      }

      const previous = chaptersRead;
      const optimistic = keepReadingGap
        ? applyOngoingChapterReadingGap(nextCount, totalChapters).chaptersRead
        : Math.max(0, nextCount);
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
   * @description Marque tous les chapitres catalogue comme lus (total − 1 si En cours).
   */
  const markAllAsRead = useCallback(async () => {
    if (!enabled || allRead) {
      return;
    }
    const target = keepReadingGap
      ? Math.max(0, totalChapters - 1)
      : totalChapters;
    await persist(target);
  }, [allRead, enabled, keepReadingGap, persist, totalChapters]);

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
