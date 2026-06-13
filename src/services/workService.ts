import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  captureWorkDeleteSnapshot,
  logActivity,
} from "@/services/activityLogService";
import type { Work } from "@/types/database";
import type { VolumeFormRow, WorkFormValues } from "@/types/workForm";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import { formatVolumeTitle } from "@/utils/volumeDisplay";

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
    .insert({
      title: form.title.trim(),
      demographic_type: form.demographicType.trim() || null,
      reading_status: form.readingStatus,
      genres: form.genres,
      themes: form.themes,
      publisher_vf: form.publisherVf.trim() || null,
      volumes_vf_count: form.volumesVfCount,
      volumes_vo_total: form.volumesVoTotal,
      default_price: form.defaultPrice,
      price_format: form.priceFormat,
      synopsis: form.synopsis.trim() || null,
      cover_url: form.coverUrl.trim() || null,
      source_url: form.sourceUrl.trim() || null,
    })
    .select("id")
    .single();

  if (workError || !work) {
    throw new Error(
      `Impossible de créer la série : ${workError?.message ?? "erreur inconnue"}`,
    );
  }

  await upsertVolumeRows(work.id, form.volumes);

  await logActivity({
    actionType: "work_create",
    entityType: "work",
    entityId: work.id,
    entityTitle: form.title.trim(),
    metadata: { volumeCount: form.volumes.length },
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
    .update({
      title: form.title.trim(),
      demographic_type: form.demographicType.trim() || null,
      reading_status: form.readingStatus,
      genres: form.genres,
      themes: form.themes,
      publisher_vf: form.publisherVf.trim() || null,
      volumes_vf_count: form.volumesVfCount,
      volumes_vo_total: form.volumesVoTotal,
      default_price: form.defaultPrice,
      price_format: form.priceFormat,
      synopsis: form.synopsis.trim() || null,
      cover_url: form.coverUrl.trim() || null,
      source_url: form.sourceUrl.trim() || null,
    })
    .eq("id", workId);

  if (workError) {
    throw new Error(`Impossible de modifier la série : ${workError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("volumes")
    .delete()
    .eq("work_id", workId);

  if (deleteError) {
    throw new Error(`Impossible de réinitialiser les tomes : ${deleteError.message}`);
  }

  await upsertVolumeRows(workId, form.volumes);
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
      "id, volume_number, volume_label, cover_url, release_date, purchase_date, purchase_price, price_manual_override, edition_type",
    )
    .eq("work_id", workId)
    .order("volume_number", { ascending: true, nullsFirst: false });

  if (volumeError) {
    throw new Error(`Impossible de charger les tomes : ${volumeError.message}`);
  }

  const volumeIds = (volumeRows ?? []).map((row) => row.id);
  const ownersByVolume = new Map<string, { ownerIds: string[]; mihonOwnerId: string | null }>();

  if (volumeIds.length > 0) {
    const { data: ownerLinks, error: ownerError } = await supabase
      .from("volume_owners")
      .select("volume_id, owner_id, has_mihon")
      .in("volume_id", volumeIds);

    if (ownerError) {
      throw new Error(
        `Impossible de charger les propriétaires des tomes : ${ownerError.message}`,
      );
    }

    for (const link of ownerLinks ?? []) {
      const current = ownersByVolume.get(link.volume_id) ?? {
        ownerIds: [],
        mihonOwnerId: null,
      };
      if (link.has_mihon) {
        current.mihonOwnerId = link.owner_id;
      } else {
        current.ownerIds.push(link.owner_id);
      }
      ownersByVolume.set(link.volume_id, current);
    }
  }

  const volumes: VolumeFormRow[] = (volumeRows ?? []).map((row) => {
    const owners = ownersByVolume.get(row.id) ?? {
      ownerIds: [],
      mihonOwnerId: null,
    };
    return {
      volumeNumber: row.volume_number,
      volumeLabel: row.volume_label ?? undefined,
      coverUrl: row.cover_url ?? "",
      releaseDate: row.release_date ?? "",
      purchaseDate: row.purchase_date ?? "",
      catalogPrice:
        row.price_manual_override && row.purchase_price != null
          ? Number(row.purchase_price)
          : null,
      editionType: row.edition_type,
      ownerIds: owners.ownerIds,
      mihonOwnerId: owners.mihonOwnerId,
    };
  });

  return { work, volumes };
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
  return {
    title: work.title,
    demographicType: work.demographic_type ?? "",
    readingStatus: normalizeWorkReadingStatus(work.reading_status),
    genres: work.genres ?? [],
    themes: work.themes ?? [],
    publisherVf: work.publisher_vf ?? "",
    volumesVfCount: work.volumes_vf_count,
    volumesVoTotal: work.volumes_vo_total,
    defaultPrice: work.default_price,
    priceFormat: work.price_format,
    synopsis: work.synopsis ?? "",
    coverUrl: work.cover_url ?? "",
    sourceUrl: work.source_url ?? "",
    volumes,
  };
}

/**
 * @description Ajoute un seul tome à une œuvre existante.
 * @param workId - Identifiant de l'œuvre.
 * @param volume - Données du tome à créer.
 * @param existingVolumeNumbers - Numéros déjà présents (évite les doublons).
 */
export async function addVolumeToWork(
  workId: string,
  volume: VolumeFormRow,
  existingVolumeNumbers: number[],
  workTitle?: string,
): Promise<void> {
  const label = volume.volumeLabel?.trim();
  if (volume.volumeNumber == null && !label) {
    throw new Error("Renseignez un numéro de tome ou un libellé hors-série.");
  }
  if (
    volume.volumeNumber != null &&
    existingVolumeNumbers.includes(volume.volumeNumber)
  ) {
    throw new Error(`Le tome ${volume.volumeNumber} existe déjà pour cette série.`);
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
        cover_url: row.coverUrl.trim() || null,
        release_date: row.releaseDate || null,
        purchase_date: row.purchaseDate || null,
        purchase_price: row.catalogPrice ?? null,
        price_manual_override: row.catalogPrice != null,
        edition_type: row.editionType,
      })),
    )
    .select("id, volume_number, volume_label");

  if (volumeError || !insertedVolumes) {
    throw new Error(
      `Impossible d'enregistrer les tomes : ${volumeError?.message ?? "erreur inconnue"}`,
    );
  }

  const ownerLinks: Array<{
    volume_id: string;
    owner_id: string;
    has_mihon: boolean;
  }> = [];

  for (const volume of insertedVolumes) {
    const row = rows.find((item) => {
      if (volume.volume_number != null) {
        return item.volumeNumber === volume.volume_number;
      }
      return (
        item.volumeNumber == null &&
        (item.volumeLabel?.trim() || "") === (volume.volume_label?.trim() || "")
      );
    });
    if (!row) {
      continue;
    }

    if (row.mihonOwnerId) {
      ownerLinks.push({
        volume_id: volume.id,
        owner_id: row.mihonOwnerId,
        has_mihon: true,
      });
      continue;
    }

    for (const ownerId of row.ownerIds) {
      ownerLinks.push({
        volume_id: volume.id,
        owner_id: ownerId,
        has_mihon: false,
      });
    }
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
