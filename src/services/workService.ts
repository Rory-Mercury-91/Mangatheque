import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  captureVolumeDeleteSnapshot,
  captureWorkDeleteSnapshot,
  logActivity,
} from "@/services/activityLogService";
import { fetchVolumeOwnerLinks } from "@/services/volumeOwnerLinkService";
import {
  buildVolumeOwnerLinkRows,
  parseVolumeOwnerLinks,
} from "@/services/volumeOwnerLinks";
import type { Work } from "@/types/database";
import type { VolumeFormRow, WorkFormValues } from "@/types/workForm";
import { normalizeIsoDate } from "@/utils/dateFormat";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { persistCoverImageUrl } from "@/utils/coverUrl";
import { normalizeWorkTagLists } from "@/utils/workTags";
import {
  collapseChapterBulkVolumesIfNeeded,
  isChapterSeriesPlaceholder,
} from "@/utils/chapterSeries";
import { resolveWorkTrackingProfile, applyTrackingProfileToFormValues } from "@/utils/workTracking";
import { deleteWorkDetailCacheEntry } from "@/services/localDataCache";
import { formatVolumeTitle } from "@/utils/volumeDisplay";
import {
  assertUniqueVolumeRows,
  buildVolumeIdentityKey,
  canDuplicateVolumeEdition,
  formatVolumeDuplicateError,
  getAlternateEditionType,
  isDuplicateVolume,
} from "@/utils/volumeIdentity";

/**
 * @description Recherche une série existante par titre (insensible à la casse et aux accents).
 * @param title - Titre recherché.
 * @param excludeWorkId - Identifiant à exclure (mode édition).
 * @returns La série trouvée ou null.
 */
export async function findWorkByTitle(
  title: string,
  excludeWorkId?: string,
): Promise<Work | null> {
  const needle = normalizeTitleForComparison(title);
  if (!needle) {
    return null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("works").select("*");

  if (error) {
    throw new Error(
      `Impossible de vérifier les doublons : ${error.message}`,
    );
  }

  return (
    (data ?? []).find(
      (work) =>
        work.id !== excludeWorkId &&
        normalizeTitleForComparison(work.title) === needle,
    ) ?? null
  );
}

/**
 * @description Construit la ligne works depuis le formulaire (suivi hybride).
 */
function buildWorkRowFromForm(form: WorkFormValues) {
  const trackingUnit =
    form.hasChapterTracking && !form.hasVolumeTracking ? "chapter" : "volume";
  const { genres, themes } = normalizeWorkTagLists(form.genres, form.themes);

  return {
    title: form.title.trim(),
    demographic_type: form.demographicType.trim() || null,
    reading_status: form.readingStatus,
    genres,
    themes,
    publisher_vf: form.publisherVf.trim() || null,
    publisher_vf_chapter: form.hasChapterTracking
      ? form.publisherVfChapter.trim() || null
      : null,
    volumes_vf_count: form.hasVolumeTracking ? form.volumesVfCount : null,
    volumes_vo_total: form.hasVolumeTracking ? form.volumesVoTotal : null,
    chapters_vf_count: form.hasChapterTracking ? form.chaptersVfCount : null,
    chapters_vo_total: form.hasChapterTracking ? form.chaptersVoTotal : null,
    has_volume_tracking: form.hasVolumeTracking,
    has_chapter_tracking: form.hasChapterTracking,
    tracking_unit: trackingUnit,
    default_price: form.defaultPrice,
    price_format: form.priceFormat,
    chapter_price_format: form.hasChapterTracking
      ? form.chapterPriceFormat
      : null,
    synopsis: form.synopsis.trim() || null,
    cover_url: persistCoverImageUrl(form.coverUrl),
    source_url: form.sourceUrl.trim() || null,
  };
}

/**
 * @description Prépare les lignes volumes à enregistrer selon le profil hybride.
 */
function prepareVolumeRowsForSave(form: WorkFormValues): VolumeFormRow[] {
  let volumes = form.volumes;

  if (form.hasChapterTracking) {
    volumes = collapseChapterBulkVolumesIfNeeded(volumes, "chapter");
  } else {
    volumes = volumes.filter((volume) => !isChapterSeriesPlaceholder(volume));
  }

  if (!form.hasVolumeTracking) {
    volumes = volumes.filter((volume) => isChapterSeriesPlaceholder(volume));
  }

  return volumes;
}

/**
 * @description Vérifie qu'aucune autre série ne porte déjà ce titre.
 * @throws Si un doublon est détecté.
 */
async function assertUniqueWorkTitle(
  title: string,
  excludeWorkId?: string,
): Promise<void> {
  const existing = await findWorkByTitle(title, excludeWorkId);
  if (existing) {
    throw new Error(
      `La série « ${existing.title} » existe déjà dans la bibliothèque.`,
    );
  }
}

/**
 * @description Liste toutes les œuvres, les plus récentes en premier.
 * @returns Tableau d'œuvres sans les tomes détaillés.
 */
export async function fetchWorks(): Promise<Work[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Impossible de charger les séries : ${error.message}`);
  }

  return data ?? [];
}

/** Totaux chapitres catalogue après ajustement éventuel. */
export interface WorkChapterTotalsSnapshot {
  chapterVfCount: number;
  chapterVoTotal: number | null;
}

/**
 * @description Relève les totaux chapitres VF/VO si la lecture dépasse le catalogue actuel.
 * @param workId - Identifiant de l'œuvre.
 * @param minChapters - Nombre minimum de chapitres à refléter.
 * @returns Totaux effectifs après mise à jour éventuelle.
 */
export async function ensureWorkChapterTotalsAtLeast(
  workId: string,
  minChapters: number,
): Promise<WorkChapterTotalsSnapshot> {
  const supabase = getSupabaseClient();
  const { data: work, error } = await supabase
    .from("works")
    .select(
      "tracking_unit, has_volume_tracking, has_chapter_tracking, chapters_vf_count, chapters_vo_total, volumes_vf_count, volumes_vo_total",
    )
    .eq("id", workId)
    .single();

  if (error || !work) {
    throw new Error(
      `Impossible de charger la série : ${error?.message ?? workId}`,
    );
  }

  const profile = resolveWorkTrackingProfile(work);
  if (!profile.hasChapterTracking) {
    return {
      chapterVfCount: profile.chapterVfCount ?? 0,
      chapterVoTotal: profile.chapterVoTotal,
    };
  }

  const min = Math.max(0, Math.floor(minChapters));
  const currentVf = profile.chapterVfCount ?? 0;
  const currentVo = profile.chapterVoTotal;
  const nextVf = Math.max(currentVf, min);
  const nextVo =
    currentVo != null ? Math.max(currentVo, min) : min > 0 ? min : currentVo;

  const legacyChapterOnly =
    (work.tracking_unit ?? "volume") === "chapter" &&
    work.chapters_vf_count == null;

  const patch: Record<string, number> = {};

  if (nextVf > currentVf) {
    patch.chapters_vf_count = nextVf;
    if (legacyChapterOnly) {
      patch.volumes_vf_count = nextVf;
    }
  }

  if (nextVo != null && (currentVo == null || nextVo > currentVo)) {
    patch.chapters_vo_total = nextVo;
    if (legacyChapterOnly && work.chapters_vo_total == null) {
      patch.volumes_vo_total = nextVo;
    }
  }

  if (Object.keys(patch).length === 0) {
    return {
      chapterVfCount: currentVf,
      chapterVoTotal: currentVo,
    };
  }

  const { error: updateError } = await supabase
    .from("works")
    .update(patch)
    .eq("id", workId);

  if (updateError) {
    throw new Error(
      `Impossible de mettre à jour les totaux chapitres : ${updateError.message}`,
    );
  }

  await deleteWorkDetailCacheEntry(workId);

  return {
    chapterVfCount: nextVf,
    chapterVoTotal: nextVo,
  };
}

/**
 * @description Crée une œuvre et ses tomes associés en base.
 * @param form - Valeurs validées du formulaire.
 * @returns Identifiant de l'œuvre créée.
 */
export async function createWorkWithVolumes(
  form: WorkFormValues,
): Promise<string> {
  await assertUniqueWorkTitle(form.title.trim());

  const supabase = getSupabaseClient();

  const { data: work, error: workError } = await supabase
    .from("works")
    .insert(buildWorkRowFromForm(form))
    .select("id")
    .single();

  if (workError || !work) {
    throw new Error(
      `Impossible de créer la série : ${workError?.message ?? "erreur inconnue"}`,
    );
  }

  const volumeRows = prepareVolumeRowsForSave(form);
  assertUniqueVolumeRows(volumeRows, form.trackingUnit);

  await upsertVolumeRows(work.id, volumeRows);

  await logActivity({
    actionType: "work_create",
    entityType: "work",
    entityId: work.id,
    entityTitle: form.title.trim(),
    metadata: { volumeCount: volumeRows.length },
  });

  return work.id;
}

/**
 * @description Supprime une œuvre et tous ses tomes, avec journalisation.
 * @param workId - Identifiant de l'œuvre à supprimer.
 * @param reason - Justification obligatoire écrite par l'utilisateur.
 */
export async function deleteWork(workId: string, reason: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: work, error: fetchError } = await supabase
    .from("works")
    .select("id, title")
    .eq("id", workId)
    .single();

  if (fetchError || !work) {
    throw new Error(`Série introuvable : ${fetchError?.message ?? workId}`);
  }

  const snapshot = await captureWorkDeleteSnapshot(workId);

  const { error: deleteError } = await supabase
    .from("works")
    .delete()
    .eq("id", workId);

  if (deleteError) {
    throw new Error(`Suppression impossible : ${deleteError.message}`);
  }

  await logActivity({
    actionType: "work_delete",
    entityType: "work",
    entityId: workId,
    entityTitle: work.title,
    reason: reason.trim(),
    metadata: { snapshot },
  });
}

/**
 * @description Met à jour une œuvre existante et remplace ses tomes.
 * @param workId - Identifiant de l'œuvre à modifier.
 * @param form - Nouvelles valeurs du formulaire.
 */
export async function updateWorkWithVolumes(
  workId: string,
  form: WorkFormValues,
): Promise<void> {
  await assertUniqueWorkTitle(form.title.trim(), workId);

  const supabase = getSupabaseClient();

  const { error: workError } = await supabase
    .from("works")
    .update(buildWorkRowFromForm(form))
    .eq("id", workId);

  if (workError) {
    throw new Error(`Impossible de modifier la série : ${workError.message}`);
  }

  const volumeRows = prepareVolumeRowsForSave(form);
  assertUniqueVolumeRows(volumeRows, form.trackingUnit);

  const { error: deleteError } = await supabase
    .from("volumes")
    .delete()
    .eq("work_id", workId);

  if (deleteError) {
    throw new Error(`Impossible de réinitialiser les tomes : ${deleteError.message}`);
  }

  await upsertVolumeRows(workId, volumeRows);
}

/**
 * @description Charge une œuvre et ses tomes pour édition.
 * @param workId - Identifiant de l'œuvre.
 * @returns Œuvre et lignes de formulaire tomes.
 */
export async function fetchWorkForEdit(workId: string): Promise<{
  work: Work;
  volumes: VolumeFormRow[];
}> {
  const supabase = getSupabaseClient();

  const { data: work, error: workError } = await supabase
    .from("works")
    .select("*")
    .eq("id", workId)
    .single();

  if (workError || !work) {
    throw new Error(`Série introuvable : ${workError?.message ?? workId}`);
  }

  const { data: volumeRows, error: volumeError } = await supabase
    .from("volumes")
    .select(
      "id, volume_number, volume_label, cover_url, release_date, purchase_price, price_manual_override, edition_type, shared_purchase",
    )
    .eq("work_id", workId)
    .order("volume_number", { ascending: true, nullsFirst: false })
    .order("edition_type", { ascending: true });

  if (volumeError) {
    throw new Error(`Impossible de charger les tomes : ${volumeError.message}`);
  }

  const volumeIds = (volumeRows ?? []).map((row) => row.id);
  const ownersByVolume = new Map<
    string,
    { ownerIds: string[]; mihonOwnerId: string | null }
  >();

  if (volumeIds.length > 0) {
    const ownerLinks = await fetchVolumeOwnerLinks(volumeIds);
    const linksByVolume = new Map<string, typeof ownerLinks>();

    for (const link of ownerLinks) {
      const list = linksByVolume.get(link.volume_id) ?? [];
      list.push(link);
      linksByVolume.set(link.volume_id, list);
    }

    for (const [volumeId, links] of linksByVolume) {
      ownersByVolume.set(volumeId, parseVolumeOwnerLinks(links));
    }
  }

  const volumes: VolumeFormRow[] = (volumeRows ?? []).map((row) => {
    const owners = ownersByVolume.get(row.id) ?? {
      ownerIds: [],
      mihonOwnerId: null,
    };
    return {
      id: row.id,
      volumeNumber:
        row.volume_number != null ? Number(row.volume_number) : null,
      volumeLabel: row.volume_label ?? undefined,
      coverUrl: row.cover_url ?? "",
      releaseDate: normalizeIsoDate(row.release_date) ?? "",
      catalogPrice:
        row.price_manual_override && row.purchase_price != null
          ? Number(row.purchase_price)
          : null,
      editionType: row.edition_type,
      sharedPurchase: row.shared_purchase ?? true,
      ownerIds: owners.ownerIds,
      mihonOwnerId: owners.mihonOwnerId,
    };
  });

  return {
    work,
    volumes: collapseChapterBulkVolumesIfNeeded(
      volumes,
      work.tracking_unit ?? "volume",
    ),
  };
}

/**
 * @description Convertit une œuvre Supabase en valeurs de formulaire.
 * @param work - Ligne œuvre.
 * @param volumes - Tomes associés.
 * @returns Valeurs prêtes pour la modale.
 */
export function workToFormValues(
  work: Work,
  volumes: VolumeFormRow[],
): WorkFormValues {
  const profile = resolveWorkTrackingProfile(work);
  const collapsedVolumes = collapseChapterBulkVolumesIfNeeded(
    volumes,
    profile.trackingUnit,
  );

  return applyTrackingProfileToFormValues(
    {
      title: work.title,
      demographicType: work.demographic_type ?? "",
      readingStatus: normalizeWorkReadingStatus(work.reading_status),
      genres: work.genres ?? [],
      themes: work.themes ?? [],
      publisherVf: work.publisher_vf ?? "",
      publisherVfChapter:
        work.publisher_vf_chapter ??
        (profile.hasChapterTracking && !profile.hasVolumeTracking
          ? work.publisher_vf ?? ""
          : ""),
      volumesVfCount: profile.volumeVfCount,
      volumesVoTotal: profile.volumeVoTotal,
      chaptersVfCount: profile.chapterVfCount,
      chaptersVoTotal: profile.chapterVoTotal,
      hasVolumeTracking: profile.hasVolumeTracking,
      hasChapterTracking: profile.hasChapterTracking,
      trackingUnit: profile.trackingUnit,
      defaultPrice: work.default_price,
      priceFormat: work.price_format,
      chapterPriceFormat: work.chapter_price_format ?? "numerique",
      synopsis: work.synopsis ?? "",
      coverUrl: work.cover_url ?? "",
      sourceUrl: work.source_url ?? "",
      volumes: collapsedVolumes,
    },
    profile,
  );
}

/**
 * @description Ajoute un seul tome à une œuvre existante.
 * @param workId - Identifiant de l'œuvre.
 * @param volume - Données du tome à créer.
 * @param existingVolumes - Tomes déjà présents (contrôle numéro + édition).
 */
export async function addVolumeToWork(
  workId: string,
  volume: VolumeFormRow,
  existingVolumes: VolumeFormRow[],
  workTitle?: string,
): Promise<void> {
  const label = volume.volumeLabel?.trim();
  if (volume.volumeNumber == null && !label) {
    throw new Error("Renseignez un numéro de tome ou un libellé hors-série.");
  }
  if (isDuplicateVolume(volume, existingVolumes)) {
    throw new Error(formatVolumeDuplicateError(volume));
  }

  await upsertVolumeRows(workId, [volume]);

  const supabase = getSupabaseClient();
  let title = workTitle?.trim();
  if (!title) {
    const { data: work } = await supabase
      .from("works")
      .select("title")
      .eq("id", workId)
      .single();
    title = work?.title ?? "Série";
  }

  const volumeTitle = formatVolumeTitle(volume.volumeNumber, volume.volumeLabel);

  await logActivity({
    actionType: "volume_create",
    entityType: "volume",
    entityTitle: `${title} — ${volumeTitle}`,
    metadata: {
      workId,
      volumeNumber: volume.volumeNumber,
      volumeLabel: label || undefined,
    },
  });
}

/**
 * @description Duplique un tome vers l'autre édition (Simple ↔ Collector).
 * @param workId - Identifiant de l'œuvre.
 * @param sourceVolume - Tome source à copier.
 * @param siblingVolumes - Autres tomes de la série.
 * @param workTitle - Titre de la série (journal d'activité).
 */
export async function duplicateVolumeEditionInWork(
  workId: string,
  sourceVolume: VolumeFormRow,
  siblingVolumes: VolumeFormRow[],
  workTitle?: string,
): Promise<void> {
  if (!canDuplicateVolumeEdition(sourceVolume, siblingVolumes)) {
    const alternateEdition = getAlternateEditionType(sourceVolume.editionType);
    throw new Error(
      formatVolumeDuplicateError({
        ...sourceVolume,
        editionType: alternateEdition,
      }),
    );
  }

  const duplicate: VolumeFormRow = {
    ...sourceVolume,
    id: undefined,
    editionType: getAlternateEditionType(sourceVolume.editionType),
  };

  await addVolumeToWork(workId, duplicate, siblingVolumes, workTitle);
}

/**
 * @description Met à jour un seul tome d'une œuvre existante.
 * @param workId - Identifiant de l'œuvre.
 * @param volumeId - Identifiant du tome à modifier.
 * @param volume - Nouvelles valeurs du tome.
 * @param siblingVolumes - Autres tomes de la série (contrôle des doublons).
 * @param workTitle - Titre de la série (journal d'activité).
 */
export async function updateVolumeInWork(
  workId: string,
  volumeId: string,
  volume: VolumeFormRow,
  siblingVolumes: VolumeFormRow[],
  workTitle?: string,
): Promise<void> {
  const label = volume.volumeLabel?.trim();
  if (volume.volumeNumber == null && !label) {
    throw new Error("Renseignez un numéro de tome ou un libellé hors-série.");
  }

  if (isDuplicateVolume(volume, siblingVolumes, volumeId)) {
    throw new Error(formatVolumeDuplicateError(volume));
  }

  const supabase = getSupabaseClient();

  const { error: updateError } = await supabase
    .from("volumes")
    .update({
      volume_number: volume.volumeNumber ?? null,
      volume_label: label || null,
      cover_url: persistCoverImageUrl(volume.coverUrl),
      release_date: normalizeIsoDate(volume.releaseDate),
      purchase_price: volume.catalogPrice ?? null,
      price_manual_override: volume.catalogPrice != null,
      edition_type: volume.editionType,
      shared_purchase: volume.sharedPurchase,
    })
    .eq("id", volumeId)
    .eq("work_id", workId);

  if (updateError) {
    throw new Error(`Impossible de modifier le tome : ${updateError.message}`);
  }

  const { error: deleteOwnersError } = await supabase
    .from("volume_owners")
    .delete()
    .eq("volume_id", volumeId);

  if (deleteOwnersError) {
    throw new Error(
      `Impossible de mettre à jour les propriétaires : ${deleteOwnersError.message}`,
    );
  }

  const ownerLinks = buildVolumeOwnerLinkRows(volumeId, volume);

  if (ownerLinks.length > 0) {
    const { error: ownerError } = await supabase
      .from("volume_owners")
      .insert(ownerLinks);

    if (ownerError) {
      throw new Error(
        `Impossible d'enregistrer les propriétaires : ${ownerError.message}`,
      );
    }
  }

  let title = workTitle?.trim();
  if (!title) {
    const { data: work } = await supabase
      .from("works")
      .select("title")
      .eq("id", workId)
      .single();
    title = work?.title ?? "Série";
  }

  const volumeTitle = formatVolumeTitle(volume.volumeNumber, volume.volumeLabel);

  await logActivity({
    actionType: "volume_update",
    entityType: "volume",
    entityId: volumeId,
    entityTitle: `${title} — ${volumeTitle}`,
    metadata: {
      workId,
      volumeNumber: volume.volumeNumber,
      volumeLabel: label || undefined,
    },
  });
}

const MIN_VOLUME_DELETE_REASON_LENGTH = 4;

/**
 * @description Supprime un tome d'une œuvre avec justification et snapshot journal.
 * @param workId - Identifiant de l'œuvre parente.
 * @param volumeId - Identifiant du tome à supprimer.
 * @param reason - Justification obligatoire.
 * @param workTitle - Titre de la série (journal d'activité).
 */
export async function deleteVolumeFromWork(
  workId: string,
  volumeId: string,
  reason: string,
  workTitle?: string,
): Promise<void> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < MIN_VOLUME_DELETE_REASON_LENGTH) {
    throw new Error(
      `La justification doit contenir au moins ${MIN_VOLUME_DELETE_REASON_LENGTH} caractères.`,
    );
  }

  const snapshot = await captureVolumeDeleteSnapshot(volumeId);

  if (snapshot.workId !== workId) {
    throw new Error("Ce tome n'appartient pas à cette série.");
  }

  const supabase = getSupabaseClient();
  const volumeTitle = formatVolumeTitle(
    snapshot.volume.volume_number as number | null | undefined,
    (snapshot.volume.volume_label as string | null | undefined) ?? undefined,
  );
  const title = workTitle ?? snapshot.workTitle;

  const { error: deleteError } = await supabase
    .from("volumes")
    .delete()
    .eq("id", volumeId)
    .eq("work_id", workId);

  if (deleteError) {
    throw new Error(`Suppression impossible : ${deleteError.message}`);
  }

  await logActivity({
    actionType: "volume_delete",
    entityType: "volume",
    entityId: volumeId,
    entityTitle: `${title} — ${volumeTitle}`,
    reason: trimmedReason,
    metadata: { snapshot, workId },
  });
}

/**
 * @description Insère les tomes et leurs propriétaires pour une œuvre.
 * @param workId - Identifiant parent.
 * @param rows - Lignes du formulaire.
 */
async function upsertVolumeRows(
  workId: string,
  rows: VolumeFormRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const supabase = getSupabaseClient();

  const { data: insertedVolumes, error: volumeError } = await supabase
    .from("volumes")
    .insert(
      rows.map((row) => ({
        work_id: workId,
        volume_number: row.volumeNumber ?? null,
        volume_label: row.volumeLabel?.trim() || null,
        cover_url: persistCoverImageUrl(row.coverUrl),
        release_date: normalizeIsoDate(row.releaseDate),
        purchase_price: row.catalogPrice ?? null,
        price_manual_override: row.catalogPrice != null,
        edition_type: row.editionType,
        shared_purchase: row.sharedPurchase,
      })),
    )
    .select("id, volume_number, volume_label, edition_type");

  if (volumeError || !insertedVolumes) {
    throw new Error(
      `Impossible d'enregistrer les tomes : ${volumeError?.message ?? "erreur inconnue"}`,
    );
  }

  const ownerLinks: ReturnType<typeof buildVolumeOwnerLinkRows> = [];

  for (const volume of insertedVolumes) {
    const row = rows.find((item) => {
      const itemKey = buildVolumeIdentityKey(item);
      const volumeKey = buildVolumeIdentityKey({
        volumeNumber:
          volume.volume_number != null ? Number(volume.volume_number) : null,
        volumeLabel: volume.volume_label ?? undefined,
        editionType: volume.edition_type as VolumeFormRow["editionType"],
      });
      return itemKey !== "" && itemKey === volumeKey;
    });
    if (!row) {
      continue;
    }

    ownerLinks.push(...buildVolumeOwnerLinkRows(volume.id, row));
  }

  if (ownerLinks.length > 0) {
    const { error: ownerError } = await supabase
      .from("volume_owners")
      .insert(ownerLinks);

    if (ownerError) {
      throw new Error(
        `Impossible d'enregistrer les propriétaires : ${ownerError.message}`,
      );
    }
  }
}
