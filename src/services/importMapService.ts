import type { PriceFormat, ScrapePayloadV1 } from "@/types/database";
import {
  createEmptyWorkFormValues,
  type WorkFormValues,
} from "@/types/workForm";

/**
 * @description Convertit un payload Tampermonkey (v1) en valeurs de formulaire.
 * @param payload - Données normalisées issues du script Nautiljon.
 * @returns Valeurs pré-remplies pour la modale d'ajout.
 */
export function scrapePayloadToFormValues(
  payload: ScrapePayloadV1,
): WorkFormValues {
  const base = createEmptyWorkFormValues();

  return {
    ...base,
    title: payload.title,
    demographicType: payload.demographicType ?? "",
    genres: payload.genres ?? [],
    themes: payload.themes ?? [],
    publisherVf: payload.publisherVf ?? "",
    volumesVfCount: payload.volumesVfCount ?? null,
    volumesVoTotal: payload.volumesVoTotal ?? null,
    defaultPrice: payload.defaultPrice ?? null,
    priceFormat: payload.priceFormat ?? "broche",
    synopsis: payload.synopsis ?? "",
    coverUrl: payload.coverUrl ?? "",
    sourceUrl: payload.sourceUrl,
    volumes: filterVfVolumes(payload.volumes ?? [], payload.volumesVfCount),
  };
}

/**
 * @description Ne conserve que les tomes VF (limite au nombre VF connu).
 * @param volumes - Tomes scrapés.
 * @param volumesVfCount - Nombre de tomes VF parus selon Nautiljon.
 * @returns Lignes formulaire pour tomes VF uniquement.
 */
function filterVfVolumes(
  volumes: NonNullable<ScrapePayloadV1["volumes"]>,
  volumesVfCount?: number,
): WorkFormValues["volumes"] {
  const maxVf =
    volumesVfCount != null && volumesVfCount > 0
      ? volumesVfCount
      : undefined;

  const filtered = maxVf
    ? volumes.filter((v) => v.volumeNumber <= maxVf)
    : volumes;

  return filtered.map((volume) => ({
    volumeNumber: volume.volumeNumber,
    coverUrl: volume.coverUrl ?? "",
    releaseDate: volume.releaseDate ?? "",
    purchaseDate: "",
    editionType: "classic" as const,
    ownerIds: [],
    mihonOwnerId: null,
  }));
}

/**
 * @description Déduit le format de prix depuis le libellé Nautiljon.
 * @param typeVolume - Texte type volume (Broché, Kindle, etc.).
 * @returns `broche` ou `numerique`.
 */
export function mapNautiljonPriceFormat(typeVolume: string): PriceFormat {
  const lower = typeVolume.toLowerCase();
  if (lower.includes("kindle") || lower.includes("numérique") || lower.includes("numerique")) {
    return "numerique";
  }
  return "broche";
}

/**
 * @description Parse une liste séparée par des virgules (genres, thèmes).
 * @param value - Chaîne brute ou tableau déjà parsé.
 * @returns Tableau de libellés nettoyés.
 */
export function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
