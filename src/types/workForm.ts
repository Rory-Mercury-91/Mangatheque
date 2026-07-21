import type { EditionType, PriceFormat, TrackingUnit, WorkReadingStatus } from "@/types/database";

/** Ligne tome dans le formulaire d'ajout / modification. */
export interface VolumeFormRow {
  /** Identifiant Supabase (présent après chargement depuis la base). */
  id?: string;
  volumeNumber: number | null;
  volumeLabel?: string;
  coverUrl: string;
  releaseDate: string;
  /** Prix catalogue Nautiljon (override du prix par défaut de la série). */
  catalogPrice?: number | null;
  editionType: EditionType;
  /** Co-achat partagé (coût divisé) si plusieurs acheteurs. */
  sharedPurchase: boolean;
  ownerIds: string[];
  mihonOwnerId: string | null;
}

/** Valeurs du formulaire œuvre + tomes. */
export interface WorkFormValues {
  title: string;
  demographicType: string;
  readingStatus: WorkReadingStatus;
  genres: string[];
  themes: string[];
  publisherVf: string;
  publisherVfChapter: string;
  volumesVfCount: number | null;
  volumesVoTotal: number | null;
  chaptersVfCount: number | null;
  chaptersVoTotal: number | null;
  hasVolumeTracking: boolean;
  hasChapterTracking: boolean;
  /** Legacy — dérivé des flags has_*_tracking. */
  trackingUnit: TrackingUnit;
  defaultPrice: number | null;
  priceFormat: PriceFormat;
  chapterPriceFormat: PriceFormat;
  synopsis: string;
  coverUrl: string;
  sourceUrl: string;
  /** Identifiant MyAnimeList (optionnel). */
  malId: number | null;
  /** Identifiant AniList (optionnel). */
  anilistId: number | null;
  volumes: VolumeFormRow[];
}

/**
 * @description Prochain numéro de tome suggéré selon la liste existante.
 * @param volumes Tomes déjà enregistrés.
 * @returns Numéro du prochain tome.
 */
export function getNextVolumeNumber(volumes: VolumeFormRow[]): number {
  const numbered = volumes
    .map((volume) => volume.volumeNumber)
    .filter((n): n is number => n != null);
  if (numbered.length === 0) {
    return 1;
  }
  return Math.max(...numbered) + 1;
}

/**
 * @description Ligne tome vide pour ajout rapide.
 * @param volumeNumber Numéro du tome.
 * @returns Ligne formulaire initialisée.
 */
export function createEmptyVolumeRow(volumeNumber: number): VolumeFormRow {
  return {
    volumeNumber,
    coverUrl: "",
    releaseDate: "",
    editionType: "classic",
    sharedPurchase: true,
    ownerIds: [],
    mihonOwnerId: null,
  };
}

/**
 * @description Valeurs par défaut d'un formulaire œuvre vide.
 * @returns Formulaire initialisé avec listes vides.
 */
export function createEmptyWorkFormValues(): WorkFormValues {
  return {
    title: "",
    demographicType: "",
    readingStatus: "ongoing",
    genres: [],
    themes: [],
    publisherVf: "",
    publisherVfChapter: "",
    volumesVfCount: null,
    volumesVoTotal: null,
    chaptersVfCount: null,
    chaptersVoTotal: null,
    hasVolumeTracking: true,
    hasChapterTracking: false,
    trackingUnit: "volume",
    defaultPrice: null,
    priceFormat: "broche",
    chapterPriceFormat: "numerique",
    synopsis: "",
    coverUrl: "",
    sourceUrl: "",
    malId: null,
    anilistId: null,
    volumes: [],
  };
}
