/** Statut de liste animé (aligné MAL). */
export type AnimeListStatus =
  | "watching"
  | "completed"
  | "on_hold"
  | "dropped"
  | "plan_to_watch";

/** Entrée streaming mise en cache. */
export interface AnimeStreamingEntry {
  name: string;
  url: string;
}

/** Image galerie. */
export interface AnimePicture {
  medium?: string;
  large?: string;
}

/** Origine d'une relation (API = non retirable ; user = ajout manuel). */
export type AnimeRelatedSource = "api" | "user";

/** Relation MAL/Jikan mise en cache (ou liaison locale sans MAL). */
export interface AnimeRelatedEntry {
  /** Identifiant MAL ; `0` si liaison locale uniquement (`workId`). */
  malId: number;
  type: "anime" | "manga" | string;
  name: string;
  relation: string;
  url?: string;
  image?: string | null;
  /** Absent ou `user` = retirable ; `api` = fournie par MAL/Jikan. */
  source?: AnimeRelatedSource;
  /** Identifiant local de l'œuvre (lecture) — permet de lier sans MAL ID. */
  workId?: string;
}

/** Marqueur interne : relation retirée manuellement (Jikan ne doit pas la réinjecter). */
export const RELATED_SUPPRESSED = "__suppressed__";

/**
 * @description Indique si une relation a été masquée manuellement.
 */
export function isRelatedSuppressed(entry: AnimeRelatedEntry): boolean {
  return entry.relation === RELATED_SUPPRESSED;
}

/**
 * @description Relations visibles (hors masquages manuels).
 */
export function visibleAnimeRelated(
  related: AnimeRelatedEntry[],
): AnimeRelatedEntry[] {
  return related.filter((entry) => !isRelatedSuppressed(entry));
}

/**
 * @description Indique si l'utilisateur peut retirer cette relation (ajout manuel uniquement).
 */
export function canRemoveAnimeRelated(entry: AnimeRelatedEntry): boolean {
  if (isRelatedSuppressed(entry)) return false;
  return entry.source !== "api";
}

/**
 * @description Clé stable d'une relation (workId local prioritaire, sinon MAL).
 */
export function animeRelatedEntryKey(entry: AnimeRelatedEntry): string {
  const type = String(entry.type).toLowerCase();
  const workId = entry.workId?.trim();
  if (workId) return `${type}:work:${workId}`;
  return `${type}:mal:${Number(entry.malId)}`;
}

/**
 * @description Indique si la relation pointe vers une œuvre lecture donnée.
 * @param entry - Entrée related.
 * @param workId - UUID local de l'œuvre.
 * @param mangaMalId - MAL ID optionnel de l'œuvre.
 */
export function relatedEntryMatchesWork(
  entry: AnimeRelatedEntry,
  workId: string,
  mangaMalId?: number | null,
): boolean {
  if (String(entry.type).toLowerCase() !== "manga") return false;
  if (isRelatedSuppressed(entry)) return false;
  const entryWorkId = entry.workId?.trim();
  if (entryWorkId && entryWorkId === workId) return true;
  if (
    mangaMalId != null &&
    Number(entry.malId) === Number(mangaMalId) &&
    Number(entry.malId) > 0
  ) {
    return true;
  }
  return false;
}

/** Recommandation MAL mise en cache. */
export interface AnimeRecommendationEntry {
  malId: number;
  title: string;
  votes: number;
  image?: string | null;
}

/** Animé du catalogue foyer. */
export interface Anime {
  id: string;
  mal_id: number;
  /** Identifiant ADKami (agenda). Partagé entre saisons MAL d'une même série. */
  adkami_id: number | null;
  /** Segment d'URL ADKami (`anime`, `hentai`, `drama`…). */
  adkami_section: string | null;
  /**
   * Décalage ADKami → épisode local (MAL).
   * Préférer `adkami_episode_from` ; offset = from − 1 si renseigné.
   */
  adkami_episode_offset: number;
  /** Premier épisode ADKami (absolu) de cette saison. */
  adkami_episode_from: number | null;
  /** Dernier épisode ADKami (absolu) de cette saison. */
  adkami_episode_to: number | null;
  /** Saison prioritaire pour le planning (même `adkami_id`). */
  adkami_season_active: boolean;
  /** N° de saison ADKami (segment URL), pour matching multi-saisons. */
  adkami_season_index: number | null;
  /**
   * Mapping MAL ↔ ADKami contrôlé / validé.
   * Exclut la fiche des listes d’attribution des autres pages ADKami.
   */
  adkami_mapping_validated: boolean;
  /** URL fiche Nautiljon (animé), optionnelle. */
  source_url: string | null;
  title: string;
  title_en: string | null;
  title_ja: string | null;
  title_fr: string | null;
  cover_url: string | null;
  media_type: string | null;
  source: string | null;
  status: string | null;
  season: string | null;
  year: number | null;
  episodes: number | null;
  duration_seconds: number | null;
  broadcast_day: string | null;
  broadcast_time: string | null;
  rating: string | null;
  nsfw: string | null;
  synopsis: string | null;
  genres: string[];
  themes: string[];
  demographics: string[];
  explicit_genres: string[];
  studios: string[];
  streaming: AnimeStreamingEntry[];
  pictures: AnimePicture[];
  related: AnimeRelatedEntry[];
  recommendations: AnimeRecommendationEntry[];
  created_at: string;
  updated_at: string;
}

/** Progression visionnage d'un utilisateur. */
export interface UserAnimeProgress {
  user_id: string;
  anime_id: string;
  list_status: AnimeListStatus;
  episodes_watched: number;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

/**
 * @description Titre d'affichage principal (FR si renseigné, sinon titre principal).
 */
export function resolveAnimeDisplayTitle(anime: Pick<Anime, "title" | "title_fr">): string {
  const fr = anime.title_fr?.trim();
  if (fr) return fr;
  return anime.title;
}
