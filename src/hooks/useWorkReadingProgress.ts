import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import {
  fetchReadVolumeIdsForWork,
  markAllVolumesRead,
  setVolumeRead,
} from "@/services/readingProgressService";

/**
 * @description Historique de lecture du compte connecté pour une série (catalogue complet).
 * @param workId - Identifiant de l'œuvre.
 * @param trackableVolumeIds - Tomes du catalogue avec identifiant Supabase.
 */
export function useWorkReadingProgress(
  workId: string | undefined,
  trackableVolumeIds: string[],
) {
  const { user } = useAuth();
  const [readVolumeIds, setReadVolumeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const enabled = Boolean(user && workId);

  const reloadProgress = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!enabled || !workId) {
        setReadVolumeIds(new Set());
        setLoading(false);
        return;
      }

      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }

      try {
        const ids = await fetchReadVolumeIdsForWork(workId);
        setReadVolumeIds(ids);
      } catch (err) {
        console.warn("Impossible de recharger les tomes lus :", err);
        if (!silent) {
          setReadVolumeIds(new Set());
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
    reloadProgress,
  };
}
