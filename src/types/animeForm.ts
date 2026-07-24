import type { AnimeListStatus } from "@/types/anime";

/** Valeurs du formulaire création / édition animé. */
export interface AnimeFormValues {
  malId: number | null;
  title: string;
  titleEn: string;
  titleJa: string;
  titleFr: string;
  coverUrl: string;
  /** URL fiche Nautiljon. */
  sourceUrl: string;
  /** Identifiant ADKami (lien agenda dérivable). */
  adkamiId: number | null;
  /** Segment URL ADKami : anime | hentai | drama… */
  adkamiSection: string;
  mediaType: string;
  source: string;
  status: string;
  season: string;
  year: number | null;
  episodes: number | null;
  durationSeconds: number | null;
  broadcastDay: string;
  broadcastTime: string;
  rating: string;
  nsfw: string;
  synopsis: string;
  genres: string[];
  themes: string[];
  demographics: string[];
  explicitGenres: string[];
  studios: string[];
  streaming: { name: string; url: string }[];
  pictures: { medium?: string; large?: string }[];
  related: {
    malId: number;
    type: string;
    name: string;
    relation: string;
    url?: string;
    image?: string | null;
  }[];
  recommendations: {
    malId: number;
    title: string;
    votes: number;
    image?: string | null;
  }[];
  /** Suivi optionnel (seed création / import MAL — pas édité dans la modale). */
  listStatus: AnimeListStatus;
  episodesWatched: number;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * @description Valeurs vides pour une nouvelle fiche animé.
 */
export function createEmptyAnimeFormValues(): AnimeFormValues {
  return {
    malId: null,
    title: "",
    titleEn: "",
    titleJa: "",
    titleFr: "",
    coverUrl: "",
    sourceUrl: "",
    adkamiId: null,
    adkamiSection: "anime",
    mediaType: "tv",
    source: "",
    status: "finished_airing",
    season: "",
    year: null,
    episodes: null,
    durationSeconds: null,
    broadcastDay: "",
    broadcastTime: "",
    rating: "",
    nsfw: "white",
    synopsis: "",
    genres: [],
    themes: [],
    demographics: [],
    explicitGenres: [],
    studios: [],
    streaming: [],
    pictures: [],
    related: [],
    recommendations: [],
    listStatus: "plan_to_watch",
    episodesWatched: 0,
    startedAt: null,
    finishedAt: null,
  };
}
