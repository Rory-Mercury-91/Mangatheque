/** Format de prix par défaut pour une œuvre et ses tomes. */
export type PriceFormat = "broche" | "numerique";

/** Édition d'un tome : classique ou collector. */
export type EditionType = "classic" | "collector";

/** Statut de lecture d'une œuvre. */
export type WorkReadingStatus = "ongoing" | "dropped" | "completed" | "on_hold";

/** Genres démographiques courants (extensible). */
export type DemographicType =
  | "shonen"
  | "seinen"
  | "shojo"
  | "josei"
  | "kodomomuke"
  | "autre";

/** Propriétaire fixe du foyer. */
export interface Owner {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

/** Œuvre (manga, webtoon, light novel…). */
export interface Work {
  id: string;
  title: string;
  demographic_type: DemographicType | string | null;
  reading_status?: WorkReadingStatus | null;
  genres: string[];
  themes: string[];
  publisher_vf: string | null;
  volumes_vf_count: number | null;
  volumes_vo_total: number | null;
  default_price: number | null;
  price_format: PriceFormat;
  synopsis: string | null;
  cover_url: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Tome d'une œuvre. */
export interface Volume {
  id: string;
  work_id: string;
  volume_number: number | null;
  volume_label: string | null;
  cover_url: string | null;
  release_date: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  price_manual_override: boolean;
  edition_type: EditionType;
  created_at: string;
  updated_at: string;
}

/**
 * Lien tome ↔ propriétaire.
 * `has_mihon` = ce tome est sur le compte Mihon de cette personne
 * (Céline, Sébastien ou Alexandre) — sert à savoir sur quel appareil/compte l'œuvre a été téléchargée.
 */
export interface VolumeOwner {
  volume_id: string;
  owner_id: string;
  has_mihon: boolean;
}

/** Données d'un propriétaire sur un tome (pour calculs financiers). */
export interface VolumeOwnerShare {
  ownerId: string;
  hasMihon: boolean;
}

/** Résultat financier par propriétaire pour un tome. */
export interface OwnerFinancialResult {
  ownerId: string;
  amountPaid: number;
  mihonSavings: number;
}

/** Répartition financière complète d'un tome. */
export interface VolumeFinancials {
  effectivePrice: number;
  perOwner: OwnerFinancialResult[];
  totalPaid: number;
  totalMihonSavings: number;
}

/** Entrée pour le calcul financier d'une série (plusieurs tomes). */
export interface SeriesVolumeInput {
  effectivePrice: number;
  owners: VolumeOwnerShare[];
}

/** Totaux financiers par propriétaire sur une série complète. */
export interface OwnerSeriesTotals {
  ownerId: string;
  amountPaid: number;
  mihonSavings: number;
}

/** Synthèse financière d'une œuvre (tous les tomes). */
export interface SeriesFinancials {
  catalogValue: number;
  totalPaid: number;
  totalMihonSavings: number;
  perOwner: OwnerSeriesTotals[];
}

/** Payload v1 pour import Tampermonkey / Nautiljon. */
export interface ScrapePayloadV1 {
  schemaVersion: 1;
  title: string;
  demographicType?: string;
  genres?: string[];
  themes?: string[];
  publisherVf?: string;
  volumesVfCount?: number;
  volumesVoTotal?: number;
  defaultPrice?: number;
  priceFormat?: PriceFormat;
  synopsis?: string;
  coverUrl?: string;
  sourceUrl: string;
  /** Statut VF Nautiljon : ongoing, completed, dropped, on_hold. */
  readingStatus?: WorkReadingStatus;
  volumes?: Array<{
    volumeNumber?: number | null;
    volumeLabel?: string;
    coverUrl?: string;
    releaseDate?: string;
    editionType?: EditionType;
    /** Prix catalogue VF scrapé sur la fiche tome Nautiljon. */
    catalogPrice?: number | null;
  }>;
}
