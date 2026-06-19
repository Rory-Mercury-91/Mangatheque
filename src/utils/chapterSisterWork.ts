import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import type { Work } from "@/types/database";
import {
  createEmptyWorkFormValues,
  type WorkFormValues,
} from "@/types/workForm";

/** Suffixe Tampermonkey pour la fiche tomes jumelle. */
export const VOLUME_WORK_TITLE_SUFFIX = " (Tomes)";

/**
 * @description Retire le suffixe « (Tomes) » d'un titre de série volumes.
 */
export function getBaseWorkTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.endsWith(VOLUME_WORK_TITLE_SUFFIX)) {
    return trimmed.slice(0, -VOLUME_WORK_TITLE_SUFFIX.length).trim();
  }
  return trimmed;
}

/**
 * @description Construit les valeurs formulaire d'une série chapitres jumelle.
 * @param source - Série tomes source (métadonnées partagées, sans les tomes).
 */
export function buildChapterSisterWorkFormValues(source: Work): WorkFormValues {
  return {
    ...createEmptyWorkFormValues(),
    title: getBaseWorkTitle(source.title),
    demographicType: source.demographic_type ?? "",
    readingStatus: normalizeWorkReadingStatus(source.reading_status),
    genres: [...(source.genres ?? [])],
    themes: [...(source.themes ?? [])],
    publisherVf: source.publisher_vf ?? "",
    volumesVfCount: null,
    volumesVoTotal: null,
    trackingUnit: "chapter",
    defaultPrice: source.default_price,
    priceFormat: source.price_format,
    synopsis: source.synopsis ?? "",
    coverUrl: source.cover_url ?? "",
    sourceUrl: source.source_url ?? "",
    volumes: [],
  };
}

/**
 * @description Variante depuis le formulaire d'édition (série tomes en cours).
 */
export function buildChapterSisterWorkFormValuesFromForm(
  form: WorkFormValues,
): WorkFormValues {
  return {
    ...createEmptyWorkFormValues(),
    title: getBaseWorkTitle(form.title),
    demographicType: form.demographicType,
    readingStatus: form.readingStatus,
    genres: [...form.genres],
    themes: [...form.themes],
    publisherVf: form.publisherVf,
    volumesVfCount: null,
    volumesVoTotal: null,
    trackingUnit: "chapter",
    defaultPrice: form.defaultPrice,
    priceFormat: form.priceFormat,
    synopsis: form.synopsis,
    coverUrl: form.coverUrl,
    sourceUrl: form.sourceUrl,
    volumes: [],
  };
}
