import { getSupabaseClient } from "@/lib/supabaseClient";
import { deriveUserReadingStatus } from "@/constants/userReadingStatus";
import type { LibraryUserReadingMeta } from "@/types/libraryFilters";
import type { Work } from "@/types/database";
import { shouldHideChapterVolumeGrid } from "@/utils/chapterSeries";
import type { VolumeFormRow } from "@/types/workForm";

/**
 * @description Charge les identifiants de tomes lus par l'utilisateur connecté pour une série.
 * @param workId - Identifiant de l'œuvre.
 */
export async function fetchReadVolumeIdsForWork(
  workId: string,
): Promise<Set<string>> {
  const supabase = getSupabaseClient();

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

  const { data: readRows, error: readError } = await supabase
    .from("user_volume_reads")
    .select("volume_id")
    .in("volume_id", volumeIds);

  if (readError) {
    throw new Error(
      `Impossible de charger l'historique de lecture : ${readError.message}`,
    );
  }

  return new Set((readRows ?? []).map((row) => row.volume_id));
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
 * @description Charge le nombre de chapitres lus (suivi série) pour l'utilisateur connecté.
 * @param workId - Identifiant de l'œuvre.
 */
export async function fetchChapterProgress(workId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_work_chapter_progress")
    .select("chapters_read")
    .eq("work_id", workId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de charger la progression chapitres : ${error.message}`,
    );
  }

  return data?.chapters_read ?? 0;
}

/**
 * @description Enregistre le nombre de chapitres lus pour une série chapitres.
 * @param workId - Identifiant de l'œuvre.
 * @param chaptersRead - Nombre de chapitres lus (borné à maxChapters si fourni).
 * @param maxChapters - Plafond optionnel (ex. volumes_vf_count).
 */
export async function setChapterProgress(
  workId: string,
  chaptersRead: number,
  maxChapters?: number,
): Promise<number> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Connexion requise pour enregistrer la lecture.");
  }

  const cappedMax =
    maxChapters != null && maxChapters > 0 ? maxChapters : undefined;
  const normalized = Math.max(
    0,
    cappedMax != null ? Math.min(chaptersRead, cappedMax) : chaptersRead,
  );

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

  return normalized;
}

/**
 * @description Indique si l'utilisateur a marqué la série comme abandonnée.
 * @param workId - Identifiant de l'œuvre.
 */
export async function fetchWorkReadingAbandoned(
  workId: string,
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_work_reading_state")
    .select("is_abandoned")
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
  "volumeNumber" | "volumeLabel"
> & { id: string; workId: string };

/**
 * @description Calcule le statut « Ma lecture » par œuvre pour le filtrage bibliothèque.
 * @param works - Séries de la bibliothèque.
 */
export async function fetchLibraryUserReadingMeta(
  works: Work[],
): Promise<Map<string, LibraryUserReadingMeta>> {
  const result = new Map<string, LibraryUserReadingMeta>();

  if (works.length === 0) {
    return result;
  }

  const supabase = getSupabaseClient();
  const workIds = works.map((work) => work.id);

  const { data: volumeRows, error: volumeError } = await supabase
    .from("volumes")
    .select("id, work_id, volume_number, volume_label")
    .in("work_id", workIds);

  if (volumeError) {
    throw new Error(
      `Impossible de charger les tomes pour la lecture : ${volumeError.message}`,
    );
  }

  const volumesByWork = new Map<string, LibraryVolumeRow[]>();
  for (const row of volumeRows ?? []) {
    const list = volumesByWork.get(row.work_id) ?? [];
    list.push({
      id: row.id,
      workId: row.work_id,
      volumeNumber: row.volume_number,
      volumeLabel: row.volume_label,
    });
    volumesByWork.set(row.work_id, list);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const readVolumeIds = new Set<string>();
  const chapterProgressByWork = new Map<string, number>();
  const abandonedWorkIds = new Set<string>();

  if (user) {
    const volumeIds = (volumeRows ?? []).map((row) => row.id);

    if (volumeIds.length > 0) {
      const { data: readRows, error: readError } = await supabase
        .from("user_volume_reads")
        .select("volume_id")
        .eq("user_id", user.id)
        .in("volume_id", volumeIds);

      if (readError) {
        throw new Error(
          `Impossible de charger la lecture bibliothèque : ${readError.message}`,
        );
      }

      for (const row of readRows ?? []) {
        readVolumeIds.add(row.volume_id);
      }
    }

    const { data: chapterRows, error: chapterError } = await supabase
      .from("user_work_chapter_progress")
      .select("work_id, chapters_read")
      .eq("user_id", user.id)
      .in("work_id", workIds);

    if (chapterError) {
      throw new Error(
        `Impossible de charger la progression chapitres : ${chapterError.message}`,
      );
    }

    for (const row of chapterRows ?? []) {
      chapterProgressByWork.set(row.work_id, row.chapters_read);
    }

    const { data: abandonedRows, error: abandonedError } = await supabase
      .from("user_work_reading_state")
      .select("work_id, is_abandoned")
      .eq("user_id", user.id)
      .in("work_id", workIds)
      .eq("is_abandoned", true);

    if (abandonedError) {
      throw new Error(
        `Impossible de charger les séries abandonnées : ${abandonedError.message}`,
      );
    }

    for (const row of abandonedRows ?? []) {
      abandonedWorkIds.add(row.work_id);
    }
  }

  for (const work of works) {
    const volumes = volumesByWork.get(work.id) ?? [];
    const trackingUnit = work.tracking_unit ?? "volume";
    const chapterCount = work.volumes_vf_count ?? volumes.length;
    const hideChapterGrid = shouldHideChapterVolumeGrid(
      volumes as unknown as VolumeFormRow[],
      trackingUnit,
    );
    const useChapterSeriesReading =
      trackingUnit === "chapter" && hideChapterGrid && chapterCount > 0;
    const isAbandoned = abandonedWorkIds.has(work.id);

    let readCount: number;
    let totalCount: number;

    if (useChapterSeriesReading) {
      readCount = chapterProgressByWork.get(work.id) ?? 0;
      totalCount = chapterCount;
    } else {
      const trackableIds = volumes.map((volume) => volume.id);
      totalCount = trackableIds.length;
      readCount = trackableIds.filter((id) => readVolumeIds.has(id)).length;
    }

    result.set(work.id, {
      userReadingStatus: deriveUserReadingStatus(
        readCount,
        totalCount,
        isAbandoned,
      ),
    });
  }

  return result;
}
