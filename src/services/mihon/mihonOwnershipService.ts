import { getSupabaseClient } from "@/lib/supabaseClient";
import { addVolumeToWork, fetchWorkForEdit } from "@/services/workService";
import {
  createChapterSeriesPlaceholderRow,
  isChapterSeriesPlaceholder,
} from "@/utils/chapterSeries";
import type { VolumeFormRow } from "@/types/workForm";

/**
 * @description Résultat d'ajout idempotent du compte Mihon sur une fiche.
 */
export type EnsureMihonOwnershipResult = "added" | "already_present";

/**
 * @description Active `has_mihon` pour un propriétaire sur un tome (upsert ciblé).
 * Préserve `has_purchase` / `copy_count` s'ils existent déjà.
 * @param volumeId - Identifiant du tome.
 * @param ownerId - Propriétaire du compte Mihon.
 * @returns true si une modification a été écrite.
 */
async function upsertMihonFlagOnVolume(
  volumeId: string,
  ownerId: string,
): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("volume_owners")
    .select("has_mihon, has_purchase, copy_count")
    .eq("volume_id", volumeId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(
      `Impossible de lire l'appartenance Mihon : ${fetchError.message}`,
    );
  }

  if (existing?.has_mihon) {
    return false;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("volume_owners")
      .update({ has_mihon: true })
      .eq("volume_id", volumeId)
      .eq("owner_id", ownerId);

    if (updateError) {
      throw new Error(
        `Impossible d'ajouter le compte Mihon : ${updateError.message}`,
      );
    }
    return true;
  }

  const { error: insertError } = await supabase.from("volume_owners").insert({
    volume_id: volumeId,
    owner_id: ownerId,
    has_mihon: true,
    has_purchase: false,
    copy_count: 1,
  });

  if (insertError) {
    throw new Error(
      `Impossible d'enregistrer le compte Mihon : ${insertError.message}`,
    );
  }
  return true;
}

/**
 * @description Choisit les tomes qui portent le compte Mihon (placeholder chapitres
 * ou tomes physiques selon le profil de suivi).
 */
function resolveMihonOwnershipTargets(
  volumes: VolumeFormRow[],
  hasVolumeTracking: boolean,
  hasChapterTracking: boolean,
): VolumeFormRow[] {
  const placeholder = volumes.find(isChapterSeriesPlaceholder);
  const physical = volumes.filter((volume) => !isChapterSeriesPlaceholder(volume));

  if (placeholder) {
    return [placeholder];
  }

  if (hasChapterTracking && !hasVolumeTracking) {
    return [];
  }

  if (physical.length > 0 && hasVolumeTracking) {
    return physical;
  }

  if (physical.length > 0) {
    return physical;
  }

  return [];
}

/**
 * @description Garantit qu'une fiche porte le compte Mihon du propriétaire donné.
 * Ne recrée pas l'œuvre : union idempotente de `has_mihon` sur le(s) tome(s)
 * porteurs, ou création d'un placeholder « Série numérique » si besoin.
 * @param workId - Identifiant de l'œuvre (sas ou bibliothèque).
 * @param mihonOwnerId - Propriétaire du compte Mihon à rattacher.
 */
export async function ensureWorkMihonOwnership(
  workId: string,
  mihonOwnerId: string,
): Promise<EnsureMihonOwnershipResult> {
  const ownerId = mihonOwnerId.trim();
  if (!ownerId) {
    throw new Error("Propriétaire Mihon manquant.");
  }

  const { work, volumes } = await fetchWorkForEdit(workId);
  const hasVolumeTracking = work.has_volume_tracking ?? true;
  const hasChapterTracking = work.has_chapter_tracking ?? false;

  const targets = resolveMihonOwnershipTargets(
    volumes,
    hasVolumeTracking,
    hasChapterTracking,
  );

  if (targets.length === 0) {
    const alreadyOnAny = volumes.some((volume) =>
      (volume.mihonOwnerIds ?? []).includes(ownerId),
    );
    if (alreadyOnAny) {
      return "already_present";
    }

    const placeholder = createChapterSeriesPlaceholderRow({
      mihonOwnerIds: [ownerId],
    });
    await addVolumeToWork(workId, placeholder, volumes, work.title);

    if (!hasChapterTracking) {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("works")
        .update({ has_chapter_tracking: true })
        .eq("id", workId);
      if (error) {
        throw new Error(
          `Impossible d'activer le suivi chapitres : ${error.message}`,
        );
      }
    }

    return "added";
  }

  let changed = false;
  for (const volume of targets) {
    if (!volume.id) continue;
    const didChange = await upsertMihonFlagOnVolume(volume.id, ownerId);
    if (didChange) changed = true;
  }

  return changed ? "added" : "already_present";
}
