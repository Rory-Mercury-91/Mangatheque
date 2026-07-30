import type { ScrapePayloadV1 } from "@/types/database";

/** Suivi demandé après navigation Nautiljon. */
export type NautiljonImportTrackingKind = "volume" | "chapter";

/**
 * Options d'import post-WebView (équivalent simplifié du panneau Tampermonkey).
 */
export interface NautiljonImportOptions {
  /** Tomes ou chapitres. */
  tracking: NautiljonImportTrackingKind;
  /**
   * Inclure la liste de tomes scrapée.
   * Ignoré en mode chapitres (toujours sans liste).
   */
  includeVolumeList: boolean;
  /** Compteur chapitres VF (saisie manuelle, scans). */
  chaptersVfCount: number | null;
  /** Compteur chapitres VO (saisie manuelle). */
  chaptersVoTotal: number | null;
  /** Compte Mihon / propriétaire à appliquer. */
  mihonOwnerName: string | null;
  /** Acheteurs physiques (noms). */
  ownerNames: string[];
}

/**
 * @description Propose des options par défaut selon la fiche (proche Tampermonkey).
 * Sans VF → chapitres + métadonnées seules (évite d'importer toute la VO).
 * @param payload - Données brutes de la fiche.
 */
export function suggestNautiljonImportOptions(
  payload: ScrapePayloadV1,
): NautiljonImportOptions {
  const vf = payload.volumesVfCount ?? 0;
  const chapterVf = payload.chaptersVfCount ?? 0;
  const chapterVo = payload.chaptersVoTotal ?? 0;
  const hasChapterMeta = chapterVf > 0 || chapterVo > 0;

  if (vf <= 0 || hasChapterMeta) {
    return {
      tracking: "chapter",
      includeVolumeList: false,
      chaptersVfCount: payload.chaptersVfCount ?? null,
      chaptersVoTotal: payload.chaptersVoTotal ?? null,
      mihonOwnerName: payload.mihonOwnerName?.trim() || null,
      ownerNames: payload.ownerNames ?? [],
    };
  }
  return {
    tracking: "volume",
    includeVolumeList: true,
    chaptersVfCount: null,
    chaptersVoTotal: null,
    mihonOwnerName: payload.mihonOwnerName?.trim() || null,
    ownerNames: payload.ownerNames ?? [],
  };
}

/**
 * @description Applique le choix utilisateur sur le payload avant mapping formulaire.
 * @param payload - Payload scrape brut.
 * @param options - Choix (suivi + liste + compteurs + propriétaires).
 */
export function applyNautiljonImportOptionsToPayload(
  payload: ScrapePayloadV1,
  options: NautiljonImportOptions,
): ScrapePayloadV1 {
  const mihonOwnerName = options.mihonOwnerName?.trim() || undefined;
  const ownerNames =
    options.ownerNames.length > 0 ? options.ownerNames : undefined;

  if (options.tracking === "chapter") {
    return {
      ...payload,
      hasVolumeTracking: false,
      hasChapterTracking: true,
      trackingUnit: "chapter",
      volumes: undefined,
      volumesVfCount: undefined,
      volumesVoTotal: undefined,
      chaptersVfCount: options.chaptersVfCount ?? undefined,
      chaptersVoTotal: options.chaptersVoTotal ?? undefined,
      chapterPublisherVf:
        payload.chapterPublisherVf ?? payload.publisherVf ?? undefined,
      mihonOwnerName,
      ownerNames,
    };
  }

  return {
    ...payload,
    hasVolumeTracking: true,
    hasChapterTracking: false,
    trackingUnit: "volume",
    volumes: options.includeVolumeList ? payload.volumes : undefined,
    mihonOwnerName,
    ownerNames,
  };
}
