import type { AnimeListStatus } from "@/types/anime";

/** Libellés FR des statuts de liste animé. */
export const ANIME_LIST_STATUS_LABELS: Record<AnimeListStatus, string> = {
  watching: "En cours",
  completed: "Terminé",
  on_hold: "En pause",
  dropped: "Abandonné",
  plan_to_watch: "À voir",
};

/** Couleurs associées aux statuts de liste. */
export const ANIME_LIST_STATUS_COLORS: Record<AnimeListStatus, string> = {
  watching: "#22c55e",
  completed: "#3b82f6",
  on_hold: "#eab308",
  dropped: "#ef4444",
  plan_to_watch: "#94a3b8",
};

/** Options pastilles filtre visionnage. */
export const ANIME_LIST_STATUS_OPTIONS: Array<{
  value: AnimeListStatus;
  label: string;
  color: string;
}> = (
  Object.keys(ANIME_LIST_STATUS_LABELS) as AnimeListStatus[]
).map((value) => ({
  value,
  label: ANIME_LIST_STATUS_LABELS[value],
  color: ANIME_LIST_STATUS_COLORS[value],
}));

/** Statut de diffusion série (MAL / Jikan), normalisé. */
export type AnimeAiringStatus =
  | "finished_airing"
  | "currently_airing"
  | "not_yet_aired";

/** Libellés FR des statuts de diffusion. */
export const ANIME_AIRING_STATUS_LABELS: Record<AnimeAiringStatus, string> = {
  currently_airing: "En cours de diffusion",
  finished_airing: "Diffusion terminée",
  not_yet_aired: "Pas encore diffusé",
};

/** Couleurs associées aux statuts de diffusion. */
export const ANIME_AIRING_STATUS_COLORS: Record<AnimeAiringStatus, string> = {
  currently_airing: "#0ea5e9",
  finished_airing: "#84cc16",
  not_yet_aired: "#a855f7",
};

/** Options pastilles / select statut de diffusion. */
export const ANIME_AIRING_STATUS_OPTIONS: Array<{
  value: AnimeAiringStatus;
  label: string;
  color: string;
}> = (
  Object.keys(ANIME_AIRING_STATUS_LABELS) as AnimeAiringStatus[]
).map((value) => ({
  value,
  label: ANIME_AIRING_STATUS_LABELS[value],
  color: ANIME_AIRING_STATUS_COLORS[value],
}));

/**
 * @description Normalise un statut de diffusion MAL/Jikan.
 */
export function normalizeAnimeAiringStatus(
  value: string | null | undefined,
): AnimeAiringStatus | null {
  if (!value) return null;
  const s = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (
    s === "finished_airing" ||
    s.includes("finished") ||
    s === "complete"
  ) {
    return "finished_airing";
  }
  if (
    s === "not_yet_aired" ||
    s.includes("not_yet") ||
    s.includes("upcoming")
  ) {
    return "not_yet_aired";
  }
  if (
    s === "currently_airing" ||
    s.includes("currently_airing") ||
    s === "airing" ||
    s === "releasing"
  ) {
    return "currently_airing";
  }
  // « airing » seul (évite de matcher finished_airing déjà traité)
  if (s.includes("airing")) {
    return "currently_airing";
  }
  return null;
}

/**
 * @description Libellé FR d'un statut de diffusion (repli sur la valeur brute).
 */
export function formatAnimeAiringStatusLabel(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const normalized = normalizeAnimeAiringStatus(value);
  if (normalized) return ANIME_AIRING_STATUS_LABELS[normalized];
  return value.trim();
}

/** Saisons FR. */
export const ANIME_SEASON_LABELS: Record<string, string> = {
  winter: "Hiver",
  spring: "Printemps",
  summer: "Été",
  fall: "Automne",
};

/** Types média FR. */
export const ANIME_MEDIA_TYPE_LABELS: Record<string, string> = {
  tv: "Série TV",
  ova: "OVA",
  movie: "Film",
  special: "Special",
  ona: "ONA",
  music: "Musique",
};

/** Sources d’adaptation MAL (champ `source`). */
export const ANIME_SOURCE_LABELS: Record<string, string> = {
  original: "Original",
  manga: "Manga",
  "4_koma_manga": "Manga 4-koma",
  four_koma_manga: "Manga 4-koma",
  web_manga: "Web manga",
  digital_manga: "Manga numérique",
  novel: "Roman",
  light_novel: "Light novel",
  web_novel: "Web novel",
  visual_novel: "Visual novel",
  game: "Jeu vidéo",
  card_game: "Jeu de cartes",
  book: "Livre",
  picture_book: "Livre illustré",
  radio: "Radio",
  music: "Musique",
  mixed_media: "Médias mixtes",
  other: "Autre",
};

/** Options select source (clés canoniques). */
export const ANIME_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "— Non renseignée —" },
  ...Object.entries(ANIME_SOURCE_LABELS)
    .filter(([key]) => key !== "four_koma_manga")
    .map(([value, label]) => ({ value, label })),
];

/**
 * @description Normalise une clé source MAL (snake_case).
 */
export function normalizeAnimeSourceKey(
  source: string | null | undefined,
): string {
  const key = String(source ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
  if (key === "four_koma_manga") return "4_koma_manga";
  return key;
}

/**
 * @description Libellé FR d’une source d’adaptation MAL.
 * @param source - Code API (ex. light_novel) ou texte libre.
 */
export function formatAnimeSourceLabel(
  source: string | null | undefined,
): string | null {
  const raw = String(source ?? "").trim();
  if (!raw) return null;
  const key = normalizeAnimeSourceKey(raw);
  if (ANIME_SOURCE_LABELS[key]) return ANIME_SOURCE_LABELS[key];
  // Repli : snake_case → libellé lisible
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Classifications âge MAL (codes API). */
export type AnimeRating =
  | "g"
  | "pg"
  | "pg_13"
  | "r"
  | "r+"
  | "rx";

/** Libellés FR des classifications MAL. */
export const ANIME_RATING_LABELS: Record<AnimeRating, string> = {
  g: "G — Tous publics",
  pg: "PG — Enfants",
  pg_13: "PG-13 — Adolescents (13+)",
  r: "R — 17+ (violence / langage)",
  "r+": "R+ — Nudité légère",
  rx: "Rx — Hentai",
};

/** Options select classification. */
export const ANIME_RATING_OPTIONS: Array<{
  value: AnimeRating;
  label: string;
}> = (Object.keys(ANIME_RATING_LABELS) as AnimeRating[]).map((value) => ({
  value,
  label: ANIME_RATING_LABELS[value],
}));

/**
 * @description Normalise une classification MAL (g, pg_13, r+…).
 */
export function normalizeAnimeRating(
  value: string | null | undefined,
): AnimeRating | null {
  if (!value?.trim()) return null;
  const s = value.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (s === "g" || s === "all_ages") return "g";
  if (s === "pg" || s === "children") return "pg";
  if (s === "pg_13" || s === "pg13" || s.includes("teens_13")) return "pg_13";
  if (s === "r" || s === "r_17" || s.includes("17+")) return "r";
  if (s === "r+" || s === "r_plus" || s.includes("mild_nudity")) return "r+";
  if (s === "rx" || s.includes("hentai")) return "rx";
  return null;
}

/**
 * @description Libellé FR d'une classification (repli sur la valeur brute).
 */
export function formatAnimeRatingLabel(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const normalized = normalizeAnimeRating(value);
  if (normalized) return ANIME_RATING_LABELS[normalized];
  return value.trim();
}

/** Niveau NSFW MAL / foyer. */
export type AnimeNsfwLevel = "white" | "gray" | "black";

/** Libellés FR des niveaux NSFW. */
export const ANIME_NSFW_LABELS: Record<AnimeNsfwLevel, string> = {
  white: "Safe",
  gray: "Sensible",
  black: "NSFW",
};

/**
 * @description Normalise un niveau NSFW.
 */
export function normalizeAnimeNsfw(
  value: string | null | undefined,
): AnimeNsfwLevel {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "black" || s === "nsfw") return "black";
  if (s === "gray" || s === "grey" || s === "sensible") return "gray";
  return "white";
}

/**
 * @description NSFW suggéré depuis la classification MAL.
 * R / R+ → Sensible ; Rx → NSFW ; le reste → Safe.
 */
export function deriveAnimeNsfwFromRating(
  rating: string | null | undefined,
): AnimeNsfwLevel {
  const normalized = normalizeAnimeRating(rating);
  if (normalized === "rx") return "black";
  if (normalized === "r" || normalized === "r+") return "gray";
  return "white";
}

/**
 * @description Prend le niveau NSFW le plus restrictif (white < gray < black).
 */
export function mergeAnimeNsfwLevels(
  ...levels: Array<string | null | undefined>
): AnimeNsfwLevel {
  const rank: Record<AnimeNsfwLevel, number> = {
    white: 0,
    gray: 1,
    black: 2,
  };
  let best: AnimeNsfwLevel = "white";
  for (const level of levels) {
    const normalized = normalizeAnimeNsfw(level);
    if (rank[normalized] > rank[best]) best = normalized;
  }
  return best;
}

/**
 * @description Calcule le statut de liste animé depuis la progression.
 * @param episodesWatched - Épisodes vus.
 * @param episodesTotal - Total d'épisodes (null si inconnu).
 * @param abandoned - Override utilisateur « abandonnée ».
 */
export function deriveAnimeListStatus(
  episodesWatched: number,
  episodesTotal: number | null | undefined,
  abandoned: boolean,
): AnimeListStatus {
  if (abandoned) return "dropped";
  const watched = Math.max(0, episodesWatched);
  const total =
    episodesTotal != null && episodesTotal > 0 ? episodesTotal : null;
  if (watched <= 0) return "plan_to_watch";
  if (total != null && watched >= total) return "completed";
  return "watching";
}

/**
 * @description Normalise un statut de liste animé.
 */
export function normalizeAnimeListStatus(
  value: string | null | undefined,
): AnimeListStatus {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "watching" || raw === "completed" || raw === "on_hold") {
    return raw;
  }
  if (raw === "dropped") return "dropped";
  if (raw === "plan_to_watch" || raw === "plantowatch") return "plan_to_watch";
  return "plan_to_watch";
}

/**
 * @description Libellé FR d'une saison (+ année optionnelle).
 */
export function formatAnimeSeasonLabel(
  season: string | null | undefined,
  year: number | null | undefined,
): string | null {
  if (!season) return null;
  const label =
    ANIME_SEASON_LABELS[String(season).toLowerCase()] ?? String(season);
  return year != null ? `${label} ${year}` : label;
}

/** Libellés FR des types de relation MAL / Jikan. */
export const ANIME_RELATION_LABELS: Record<string, string> = {
  sequel: "Suite",
  prequel: "Préquelle",
  alternative_setting: "Univers alternatif",
  alternative_version: "Version alternative",
  side_story: "Histoire parallèle",
  parent_story: "Histoire principale",
  summary: "Résumé",
  full_story: "Histoire complète",
  spin_off: "Spin-off",
  adaptation: "Adaptation",
  character: "Personnage",
  other: "Autre",
};

/**
 * @description Libellé FR d'un type de relation animé/manga.
 * @param relation - Code MAL/Jikan (ex. sequel, side_story).
 */
export function formatAnimeRelationLabel(
  relation: string | null | undefined,
): string {
  const raw = String(relation ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
  if (!raw) return ANIME_RELATION_LABELS.other;
  return ANIME_RELATION_LABELS[raw] ?? relation!.replace(/_/g, " ");
}
