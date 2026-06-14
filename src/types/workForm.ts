import type { EditionType, PriceFormat, TrackingUnit, WorkReadingStatus } from "@/types/database";

/** Ligne tome dans le formulaire d'ajout / modification. */
export interface VolumeFormRow {
  /** Identifiant Supabase (présent après chargement depuis la base). */
  id?: string;
  volumeNumber: number | null;
  volumeLabel?: string;
  coverUrl: string;
  releaseDate: string;
  purchaseDate: string;
  /** Prix catalogue Nautiljon (override du prix par défaut de la série). */
  catalogPrice?: number | null;
  editionType: EditionType;
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
  volumesVfCount: number | null;
  volumesVoTotal: number | null;
  trackingUnit: TrackingUnit;
  defaultPrice: number | null;
  priceFormat: PriceFormat;
  synopsis: string;
  coverUrl: string;
  sourceUrl: string;
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
    purchaseDate: "",
    editionType: "classic",
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
    volumesVfCount: null,
    volumesVoTotal: null,
    trackingUnit: "volume",
    defaultPrice: null,
    priceFormat: "broche",
    synopsis: "",
    coverUrl: "",
    sourceUrl: "",
    volumes: [],
  };
}
