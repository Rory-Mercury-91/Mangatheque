import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchInBatches } from "@/services/supabaseBatchQuery";
import { ensureWorkChapterTotalsAtLeast } from "@/services/workService";
import { deriveUserReadingStatus } from "@/constants/userReadingStatus";
import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import type { LibraryUserReadingMeta } from "@/types/libraryFilters";
import type { Work } from "@/types/database";
import {
  shouldKeepChapterReadingGap,
} from "@/utils/chapterReadingGap";
import { CHAPTER_SERIES_VOLUME_LABEL } from "@/utils/chapterSeries";
import { resolveWorkTrackingProfile } from "@/utils/workTracking";
import type { VolumeFormRow } from "@/types/workForm";

/** Options de persistance de la progression chapitres. */
export interface SetChapterProgressOptions {
  /**
   * Série encore « En cours » : le +1 peut relever le catalogue (+1 d'écart).
   * Le 100 % catalogue est autorisé ; le statut UI reste « En cours ».
   */
  keepReadingGap?: boolean;
  /**
   * Autorise de relever le catalogue (bouton +1 ou saisie au-delà du total).
   */
  expandCatalogue?: boolean;
}

/**
 * @description Résout le user_id dont on lit la progression (jamais « n'importe quel foyer »).
 * Depuis le SELECT foyer, chaque requête DOIT filtrer explicitement user_id.
 * @param explicitUserId - `undefined` = session ; `null` = aucune progression ; string = compte cible.
 */
async function resolveProgressUserId(
  explicitUserId?: string | null,
): Promise<string | null> {
  if (explicitUserId !== undefined) {
    return explicitUserId;
  }
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * @description Charge les identifiants de tomes lus par l'utilisateur connecté pour une série.
 * @param workId - Identifiant de l'œuvre.
 * @param options.userId - Compte auth cible (défaut = session courante).
 */
export async function fetchReadVolumeIdsForWork(
  workId: string,
  options?: { userId?: string | null },
): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const progressUserId = await resolveProgressUserId(options?.userId);
  if (!progressUserId) {
    return new Set();
  }

  const { data: volumeRows, error: volumeError } = await supabase
    .from("volumes")
    .select("id")
    .eq("work_id", workId);

  if (volumeError) {
    throw new Error(
      `Impossible de charger les tomes pour la lecture : ${volumeError.message}`,
    );
  }

  const volumeIds = (volumeRows ?? []).map((row) => row.id);
  if (volumeIds.length === 0) {
    return new Set();
  }

  const readRows = await fetchInBatches(volumeIds, async (batch) => {
    const { data, error } = await supabase
      .from("user_volume_reads")
      .select("volume_id")
      .eq("user_id", progressUserId)
      .in("volume_id", batch);

    if (error) {
      throw new Error(
        `Impossible de charger l'historique de lecture : ${error.message}`,
      );
    }

    return data ?? [];
  });

  return new Set(readRows.map((row) => row.volume_id));
}

/**
 * @description Marque ou retire un tome de l'historique de lecture du compte courant.
 * @param volumeId - Identifiant du tome.
 * @param read - True pour marquer lu, false pour retirer.
 */
export async function setVolumeRead(
  volumeId: string,
  read: boolean,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Connexion requise pour enregistrer la lecture.");
  }

  if (read) {
    const { error } = await supabase.from("user_volume_reads").upsert(
      {
        user_id: user.id,
        volume_id: volumeId,
        read_at: new Date().toISOString(),
      },
      { onConflict: "user_id,volume_id" },
    );

    if (error) {
      throw new Error(
        `Impossible de marquer le tome comme lu : ${error.message}`,
      );
    }
    return;
  }

  const { error } = await supabase
    .from("user_volume_reads")
    .delete()
    .eq("user_id", user.id)
    .eq("volume_id", volumeId);

  if (error) {
    throw new Error(
      `Impossible de retirer le tome de la lecture : ${error.message}`,
    );
  }
}

/**
 * @description Marque tous les tomes indiqués comme lus pour le compte courant.
 * @param volumeIds - Identifiants des tomes à marquer.
 */
export async function markAllVolumesRead(volumeIds: string[]): Promise<void> {
  if (volumeIds.length === 0) {
    return;
  }

  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Connexion requise pour enregistrer la lecture.");
  }

  const readAt = new Date().toISOString();
  const { error } = await supabase.from("user_volume_reads").upsert(
    volumeIds.map((volumeId) => ({
      user_id: user.id,
      volume_id: volumeId,
      read_at: readAt,
    })),
    { onConflict: "user_id,volume_id" },
  );

  if (error) {
    throw new Error(
      `Impossible de marquer tous les tomes comme lus : ${error.message}`,
    );
  }
}

/**
 * @description Charge la progression chapitres + horodatage pour un compte auth.
 */
export async function fetchChapterProgressDetail(
  workId: string,
  options?: { userId?: string | null },
): Promise<{ chaptersRead: number; updatedAtMs: number | null }> {
  const supabase = getSupabaseClient();
  const progressUserId = await resolveProgressUserId(options?.userId);
  if (!progressUserId) {
    return { chaptersRead: 0, updatedAtMs: null };
  }

  const { data, error } = await supabase
    .from("user_work_chapter_progress")
    .select("chapters_read, updated_at")
    .eq("user_id", progressUserId)
    .eq("work_id", workId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de charger la progression chapitres : ${error.message}`,
    );
  }

  const updatedAtMs = data?.updated_at
    ? Date.parse(data.updated_at)
    : null;

  return {
    chaptersRead: data?.chapters_read ?? 0,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null,
  };
}

/**
 * @description Charge le nombre de chapitres lus pour un compte auth.
 * @param workId - Identifiant de l'œuvre.
 * @param options.userId - Compte auth cible (défaut = session courante).
 */
export async function fetchChapterProgress(
  workId: string,
  options?: { userId?: string | null },
): Promise<number> {
  const detail = await fetchChapterProgressDetail(workId, options);
  return detail.chaptersRead;
}

/** Résultat après enregistrement de la progression chapitres. */
export interface ChapterProgressSaveResult {
  chaptersRead: number;
  chapterVfTotal: number;
  chapterVoTotal: number | null;
}

/**
 * @description Enregistre le nombre de chapitres lus pour une série chapitres.
 * @param workId - Identifiant de l'œuvre.
 * @param chaptersRead - Nombre de chapitres lus.
 * @param maxChapters - Plafond catalogue actuel (relevé automatiquement si dépassé).
 * @param options - Écart forcé pour séries En cours, extension catalogue.
 */
export async function setChapterProgress(
  workId: string,
  chaptersRead: number,
  maxChapters?: number,
  options?: SetChapterProgressOptions,
): Promise<ChapterProgressSaveResult> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Connexion requise pour enregistrer la lecture.");
  }

  const keepGap = options?.keepReadingGap === true;
  const expandCatalogue = options?.expandCatalogue === true;
  const requested = Math.max(0, Math.floor(chaptersRead));
  let chapterVfTotal =
    maxChapters != null && maxChapters > 0 ? maxChapters : requested;
  let chapterVoTotal: number | null = null;
  let normalized = requested;

  if (keepGap) {
    const shouldExpand = expandCatalogue || requested > chapterVfTotal;

    if (shouldExpand && requested > 0) {
      const floor = Math.max(
        chapterVfTotal,
        expandCatalogue ? Math.max(requested + 1, chapterVfTotal) : requested,
      );
      const totals = await ensureWorkChapterTotalsAtLeast(workId, floor);
      chapterVfTotal = totals.chapterVfCount;
      chapterVoTotal = totals.chapterVoTotal;
      normalized = Math.min(requested, chapterVfTotal);
    } else {
      // Autorise 100 % catalogue ; le statut reste « En cours » côté UI
      normalized = Math.min(requested, chapterVfTotal);
    }
  } else if (requested > chapterVfTotal) {
    const totals = await ensureWorkChapterTotalsAtLeast(workId, requested);
    chapterVfTotal = totals.chapterVfCount;
    chapterVoTotal = totals.chapterVoTotal;
    normalized = Math.min(requested, chapterVfTotal);
  } else {
    normalized = Math.min(requested, chapterVfTotal);
  }

  const { error } = await supabase.from("user_work_chapter_progress").upsert(
    {
      user_id: user.id,
      work_id: workId,
      chapters_read: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,work_id" },
  );

  if (error) {
    throw new Error(
      `Impossible d'enregistrer la progression chapitres : ${error.message}`,
    );
  }

  return {
    chaptersRead: normalized,
    chapterVfTotal,
    chapterVoTotal,
  };
}

/**
 * @description Indique si un compte a marqué la série comme abandonnée.
 * @param workId - Identifiant de l'œuvre.
 * @param options.userId - Compte auth cible (défaut = session courante).
 */
export async function fetchWorkReadingAbandoned(
  workId: string,
  options?: { userId?: string | null },
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const progressUserId = await resolveProgressUserId(options?.userId);
  if (!progressUserId) {
    return false;
  }

  const { data, error } = await supabase
    .from("user_work_reading_state")
    .select("is_abandoned")
    .eq("user_id", progressUserId)
    .eq("work_id", workId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de charger l'état de lecture : ${error.message}`,
    );
  }

  return data?.is_abandoned ?? false;
}

/**
 * @description Enregistre ou retire le marquage « abandonnée » pour une série.
 * @param workId - Identifiant de l'œuvre.
 * @param abandoned - True si la série est abandonnée.
 */
export async function setWorkReadingAbandoned(
  workId: string,
  abandoned: boolean,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Connexion requise pour enregistrer la lecture.");
  }

  const { error } = await supabase.from("user_work_reading_state").upsert(
    {
      user_id: user.id,
      work_id: workId,
      is_abandoned: abandoned,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,work_id" },
  );

  if (error) {
    throw new Error(
      `Impossible d'enregistrer l'état abandonnée : ${error.message}`,
    );
  }
}

type LibraryVolumeRow = Pick<
  VolumeFormRow,
  "volumeNumber" | "volumeLabel" | "ownerIds" | "mihonOwnerIds"
> & { id: string; workId: string };

/**
 * @description Calcule le statut de lecture par œuvre pour un compte auth cible.
 * Catalogue = toutes les séries / tomes de la bibliothèque (pas de filtre possession).
 * Numérateur = progression du `targetUserId` (compte lié choisi).
 * @param works - Séries de la bibliothèque.
 * @param options.targetUserId - Compte auth dont on affiche la progression.
 */
export async function fetchLibraryUserReadingMeta(
  works: Work[],
  options?: {
    targetUserId?: string | null;
  },
): Promise<Map<string, LibraryUserReadingMeta>> {
  const result = new Map<string, LibraryUserReadingMeta>();

  if (works.length === 0) {
    return result;
  }

  const supabase = getSupabaseClient();
  const workIds = works.map((work) => work.id);

  const volumeRows = await fetchInBatches(workIds, async (batch) => {
    const { data, error } = await supabase
      .from("volumes")
      .select("id, work_id, volume_number, volume_label")
      .in("work_id", batch);

    if (error) {
      throw new Error(
        `Impossible de charger les tomes pour la lecture : ${error.message}`,
      );
    }

    return data ?? [];
  });

  const volumeIds = volumeRows.map((row) => row.id);

  const volumesByWork = new Map<string, LibraryVolumeRow[]>();
  for (const row of volumeRows) {
    const list = volumesByWork.get(row.work_id) ?? [];
    list.push({
      id: row.id,
      workId: row.work_id,
      volumeNumber: row.volume_number,
      volumeLabel: row.volume_label,
      ownerIds: [],
      mihonOwnerIds: [],
    });
    volumesByWork.set(row.work_id, list);
  }

  const progressUserId = await resolveProgressUserId(options?.targetUserId);

  const readVolumeIds = new Set<string>();
  const chapterProgressByWork = new Map<string, number>();
  const readAtByVolume = new Map<string, string>();
  const chapterUpdatedAtByWork = new Map<string, string>();
  const abandonedWorkIds = new Set<string>();

  if (progressUserId) {
    if (volumeIds.length > 0) {
      const readRows = await fetchInBatches(volumeIds, async (batch) => {
        const { data, error } = await supabase
          .from("user_volume_reads")
          .select("volume_id, read_at")
          .eq("user_id", progressUserId)
          .in("volume_id", batch);

        if (error) {
          throw new Error(
            `Impossible de charger la lecture bibliothèque : ${error.message}`,
          );
        }

        return data ?? [];
      });

      for (const row of readRows) {
        readVolumeIds.add(row.volume_id);
        if (row.read_at) {
          readAtByVolume.set(row.volume_id, row.read_at);
        }
      }
    }

    const chapterRows = await fetchInBatches(workIds, async (batch) => {
      const { data, error } = await supabase
        .from("user_work_chapter_progress")
        .select("work_id, chapters_read, updated_at")
        .eq("user_id", progressUserId)
        .in("work_id", batch);

      if (error) {
        throw new Error(
          `Impossible de charger la progression chapitres : ${error.message}`,
        );
      }

      return data ?? [];
    });

    for (const row of chapterRows) {
      chapterProgressByWork.set(row.work_id, row.chapters_read);
      if (row.updated_at) {
        chapterUpdatedAtByWork.set(row.work_id, row.updated_at);
      }
    }

    const abandonedRows = await fetchInBatches(workIds, async (batch) => {
      const { data, error } = await supabase
        .from("user_work_reading_state")
        .select("work_id, is_abandoned")
        .eq("user_id", progressUserId)
        .in("work_id", batch)
        .eq("is_abandoned", true);

      if (error) {
        throw new Error(
          `Impossible de charger les séries abandonnées : ${error.message}`,
        );
      }

      return data ?? [];
    });

    for (const row of abandonedRows) {
      abandonedWorkIds.add(row.work_id);
    }
  }

  for (const work of works) {
    const volumes = volumesByWork.get(work.id) ?? [];
    const profile = resolveWorkTrackingProfile(work);
    const physicalVolumes = volumes.filter(
      (volume) =>
        !(
          volume.volumeNumber == null &&
          volume.volumeLabel === CHAPTER_SERIES_VOLUME_LABEL
        ),
    );
    const chapterCount = profile.chapterVfCount ?? 0;
    const isAbandoned = abandonedWorkIds.has(work.id);

    let readCount = 0;
    let totalCount = 0;
    let volumesRead = 0;
    let volumesTotal = 0;
    let chaptersRead = 0;
    let chaptersTotal = 0;
    const activityTimestamps: string[] = [];

    // Catalogue complet : chapitres / tomes suivis sans filtre possession
    if (profile.hasChapterTracking && chapterCount > 0) {
      const chapterProgress = chapterProgressByWork.get(work.id) ?? 0;
      chaptersTotal = chapterCount;
      chaptersRead = Math.min(chapterProgress, chaptersTotal);
      readCount += chaptersRead;
      totalCount += chaptersTotal;
      const chapterUpdatedAt = chapterUpdatedAtByWork.get(work.id);
      if (chapterUpdatedAt && chaptersRead > 0) {
        activityTimestamps.push(chapterUpdatedAt);
      }
    }

    if (profile.hasVolumeTracking && physicalVolumes.length > 0) {
      const trackableIds = physicalVolumes
        .map((volume) => volume.id)
        .filter((id): id is string => Boolean(id));
      const readTrackableIds = trackableIds.filter((id) =>
        readVolumeIds.has(id),
      );
      volumesRead = readTrackableIds.length;
      volumesTotal = trackableIds.length;
      readCount += volumesRead;
      totalCount += volumesTotal;
      for (const volumeId of readTrackableIds) {
        const readAt = readAtByVolume.get(volumeId);
        if (readAt) {
          activityTimestamps.push(readAt);
        }
      }
    }

    const lastActivityAt =
      activityTimestamps.length > 0
        ? activityTimestamps.sort((a, b) => b.localeCompare(a))[0]
        : null;

    const workStatus = normalizeWorkReadingStatus(work.reading_status);
    const keepOngoingWhenCaughtUp = shouldKeepChapterReadingGap(
      workStatus,
      profile.hasChapterTracking,
    );

    result.set(work.id, {
      userReadingStatus: deriveUserReadingStatus(
        readCount,
        totalCount,
        isAbandoned,
        { keepOngoingWhenCaughtUp },
      ),
      readCount,
      totalCount,
      volumesRead,
      volumesTotal,
      chaptersRead,
      chaptersTotal,
      lastActivityAt,
    });
  }

  return result;
}
