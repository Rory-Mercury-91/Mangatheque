import type { EditionType, PriceFormat } from "@/types/database";

/** Ligne tome dans le formulaire d'ajout / modification. */
export interface VolumeFormRow {
  volumeNumber: number;
  coverUrl: string;
  releaseDate: string;
  purchaseDate: string;
  editionType: EditionType;
  ownerIds: string[];
  mihonOwnerId: string | null;
}

/** Valeurs du formulaire œuvre + tomes. */
export interface WorkFormValues {
  title: string;
  demographicType: string;
  genres: string[];
  themes: string[];
  publisherVf: string;
  volumesVfCount: number | null;
  volumesVoTotal: number | null;
  defaultPrice: number | null;
  priceFormat: PriceFormat;
  synopsis: string;
  coverUrl: string;
  sourceUrl: string;
  volumes: VolumeFormRow[];
}

/**
 * @description Valeurs par défaut d'un formulaire œuvre vide.
 * @returns Formulaire initialisé avec listes vides.
 */
export function createEmptyWorkFormValues(): WorkFormValues {
  return {
    title: "",
    demographicType: "",
    genres: [],
    themes: [],
    publisherVf: "",
    volumesVfCount: null,
    volumesVoTotal: null,
    defaultPrice: null,
    priceFormat: "broche",
    synopsis: "",
    coverUrl: "",
    sourceUrl: "",
    volumes: [],
  };
}
