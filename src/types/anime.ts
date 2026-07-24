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

/** Relation MAL/Jikan mise en cache. */
export interface AnimeRelatedEntry {
  malId: number;
  type: "anime" | "manga" | string;
  name: string;
  relation: string;
  url?: string;
  image?: string | null;
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
