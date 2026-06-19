/** Format de prix par défaut pour une œuvre et ses tomes. */
export type PriceFormat = "broche" | "numerique";

/** Unité de suivi d'une œuvre en bibliothèque. */
export type TrackingUnit = "volume" | "chapter";

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
  /** Éditeur VF de l'édition chapitres / numérique. */
  publisher_vf_chapter: string | null;
  volumes_vf_count: number | null;
  volumes_vo_total: number | null;
  /** Chapitres VF parus (webtoon numérique). */
  chapters_vf_count: number | null;
  chapters_vo_total: number | null;
  has_volume_tracking: boolean;
  has_chapter_tracking: boolean;
  /** Tome ou chapitre (webtoon numérique) — legacy, préférer has_*_tracking. */
  tracking_unit: TrackingUnit;
  default_price: number | null;
  price_format: PriceFormat;
  /** Format de l'édition chapitres (hybride). */
  chapter_price_format: PriceFormat | null;
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
  purchase_price: number | null;
  price_manual_override: boolean;
  edition_type: EditionType;
  /** Co-achat partagé (plusieurs acheteurs, coût divisé). */
  shared_purchase: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Lien tome ↔ propriétaire.
 * `has_mihon` = présence sur le compte Mihon.
 * `has_purchase` = achat physique (participation au coût). Les deux peuvent être vrais.
 */
export interface VolumeOwner {
  volume_id: string;
  owner_id: string;
  has_mihon: boolean;
  has_purchase: boolean;
  copy_count: number;
}

/** Données d'un propriétaire sur un tome (pour calculs financiers). */
export interface VolumeOwnerShare {
  ownerId: string;
  hasMihon: boolean;
  /** @default dérivé de !hasMihon si absent */
  hasPurchase?: boolean;
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
  /** Co-achat partagé : coût divisé entre les acheteurs (si 2+). */
  sharedPurchase?: boolean;
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

/** Tome marqué lu par un compte utilisateur (privé, non partagé). */
export interface UserVolumeRead {
  id: string;
  user_id: string;
  volume_id: string;
  read_at: string;
}

/** Progression chapitres lus au niveau série (privé, non partagé). */
export interface UserWorkChapterProgress {
  user_id: string;
  work_id: string;
  chapters_read: number;
  updated_at: string;
}

/** Payload v1 pour import Tampermonkey / Nautiljon. */
export interface ScrapePayloadV1 {
  schemaVersion: 1;
  title: string;
  demographicType?: string;
  genres?: string[];
  themes?: string[];
  publisherVf?: string;
  chapterPublisherVf?: string;
  volumesVfCount?: number;
  volumesVoTotal?: number;
  chaptersVfCount?: number;
  chaptersVoTotal?: number;
  hasVolumeTracking?: boolean;
  hasChapterTracking?: boolean;
  defaultPrice?: number;
  priceFormat?: PriceFormat;
  chapterPriceFormat?: PriceFormat;
  synopsis?: string;
  coverUrl?: string;
  sourceUrl: string;
  /** Statut VF Nautiljon : ongoing, completed, dropped, on_hold. */
  readingStatus?: WorkReadingStatus;
  /** Suivi par tome ou par chapitre (webtoon). */
  trackingUnit?: TrackingUnit;
  /** Compte Mihon (nom propriétaire) pour séries lues sur l'app Mihon. */
  mihonOwnerName?: string;
  /** Propriétaires achat physique (noms, co-achat possible). */
  ownerNames?: string[];
  volumes?: Array<{
    volumeNumber?: number | null;
    volumeLabel?: string;
    coverUrl?: string;
    releaseDate?: string;
    /** Date d'achat saisie dans la modale Tampermonkey (ISO YYYY-MM-DD). */
    editionType?: EditionType;
    /** Prix catalogue VF scrapé sur la fiche tome Nautiljon. */
    catalogPrice?: number | null;
    /** Compte Mihon pour ce tome (écrase l'appartenance achat globale). */
    mihonOwnerName?: string;
    /** Propriétaires achat physique pour ce tome (écrase l'appartenance globale). */
    ownerNames?: string[];
    /** Co-achat partagé si plusieurs propriétaires (défaut true). */
    sharedPurchase?: boolean;
  }>;
}
