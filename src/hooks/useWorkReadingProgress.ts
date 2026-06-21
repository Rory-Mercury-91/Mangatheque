import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchReadVolumeIdsForWork,
  markAllVolumesRead,
  setVolumeRead,
} from "@/services/readingProgressService";

/**
 * @description Historique de lecture privé du compte connecté pour une série.
 * @param workId - Identifiant de l'œuvre.
 * @param trackableVolumeIds - Tomes possédés (physique ou Mihon) avec identifiant Supabase.
 */
export function useWorkReadingProgress(
  workId: string | undefined,
  trackableVolumeIds: string[],
) {
  const { user } = useAuth();
  const [readVolumeIds, setReadVolumeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const enabled = Boolean(user && workId);

  useEffect(() => {
    if (!enabled || !workId) {
      setReadVolumeIds(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchReadVolumeIdsForWork(workId)
      .then((ids) => {
        if (!cancelled) {
          setReadVolumeIds(ids);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReadVolumeIds(new Set());
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

  const readCount = useMemo(
    () => trackableVolumeIds.filter((id) => readVolumeIds.has(id)).length,
    [readVolumeIds, trackableVolumeIds],
  );

  const toggleRead = useCallback(
    async (volumeId: string) => {
      if (!enabled) {
        return;
      }

      const wasRead = readVolumeIds.has(volumeId);
      const optimistic = new Set(readVolumeIds);
      if (wasRead) {
        optimistic.delete(volumeId);
      } else {
        optimistic.add(volumeId);
      }
      setReadVolumeIds(optimistic);

      try {
        await setVolumeRead(volumeId, !wasRead);
      } catch {
        setReadVolumeIds((current) => {
          const reverted = new Set(current);
          if (wasRead) {
            reverted.add(volumeId);
          } else {
            reverted.delete(volumeId);
          }
          return reverted;
        });
      }
    },
    [enabled, readVolumeIds],
  );

  const isRead = useCallback(
    (volumeId: string) => readVolumeIds.has(volumeId),
    [readVolumeIds],
  );

  const allRead =
    trackableVolumeIds.length > 0 &&
    trackableVolumeIds.every((id) => readVolumeIds.has(id));

  const markAllAsRead = useCallback(async () => {
    if (!enabled || trackableVolumeIds.length === 0 || allRead) {
      return;
    }

    const previous = readVolumeIds;
    setReadVolumeIds(new Set(trackableVolumeIds));

    try {
      await markAllVolumesRead(trackableVolumeIds);
    } catch {
      setReadVolumeIds(previous);
    }
  }, [allRead, enabled, readVolumeIds, trackableVolumeIds]);

  return {
    enabled,
    loading,
    readCount,
    totalTrackable: trackableVolumeIds.length,
    allRead,
    isRead,
    toggleRead,
    markAllAsRead,
  };
}
