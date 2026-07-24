import { trackerHttpRequest } from "@/services/tracker/oauthHttp";
import type { AnimeListStatus } from "@/types/anime";
import { normalizeAnimeListStatus } from "@/constants/animeStatus";
import { parseTrackerTimestamp } from "@/utils/trackerTimestamp";

const MAL_API = "https://api.myanimelist.net/v2";

const ANIME_DETAIL_FIELDS = [
  "id",
  "title",
  "main_picture",
  "alternative_titles",
  "start_date",
  "end_date",
  "synopsis",
  "media_type",
  "status",
  "genres",
  "num_episodes",
  "start_season",
  "broadcast",
  "source",
  "average_episode_duration",
  "rating",
  "nsfw",
  "pictures",
  "related_anime{node{id,title,main_picture}}",
  "related_manga{node{id,title,main_picture}}",
  "recommendations{node{id,title,main_picture}}",
  "studios",
  "my_list_status{status,num_episodes_watched,start_date,finish_date,updated_at}",
].join(",");

export interface MalAnimeCatalogHit {
  id: number;
  title: string;
  coverUrl: string | null;
  mediaType: string | null;
  status: string | null;
  episodes: number | null;
}

/** Entrée de la liste personnelle MAL (fiche + progression). */
export interface MalAnimeListEntry extends MalAnimeCatalogHit {
  listStatus: MalAnimeRemoteProgress | null;
}

export interface MalAnimeRemoteProgress {
  mediaId: number;
  status: AnimeListStatus | null;
  episodesWatched: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAtMs: number | null;
}

export interface MalAnimeDetail {
  id: number;
  title: string;
  titleEn: string | null;
  titleJa: string | null;
  coverUrl: string | null;
  mediaType: string | null;
  source: string | null;
  status: string | null;
  season: string | null;
  year: number | null;
  episodes: number | null;
  durationSeconds: number | null;
  broadcastDay: string | null;
  broadcastTime: string | null;
  rating: string | null;
  nsfw: string | null;
  synopsis: string | null;
  genres: string[];
  studios: string[];
  pictures: { medium?: string; large?: string }[];
  related: {
    malId: number;
    type: "anime" | "manga";
    name: string;
    relation: string;
    image?: string | null;
  }[];
  recommendations: {
    malId: number;
    title: string;
    votes: number;
    image?: string | null;
  }[];
  listStatus: MalAnimeRemoteProgress | null;
}

/**
 * @description Recherche catalogue animé MAL.
 */
export async function searchMalAnimeCatalog(
  accessToken: string,
  query: string,
  limit = 20,
): Promise<MalAnimeCatalogHit[]> {
  const url = new URL(`${MAL_API}/anime`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("nsfw", "true");
  url.searchParams.set("fields", "id,title,main_picture,media_type,status,num_episodes");

  const response = await trackerHttpRequest({
    method: "GET",
    url: url.toString(),
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MAL recherche animé HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
    );
  }

  let json: {
    data?: Array<{
      node: {
        id: number;
        title: string;
        main_picture?: { medium?: string; large?: string };
        media_type?: string;
        status?: string;
        num_episodes?: number;
      };
    }>;
  };
  try {
    json = JSON.parse(response.body) as typeof json;
  } catch {
    throw new Error("Réponse recherche animé MAL invalide.");
  }

  return (json.data ?? []).map((row) => ({
    id: row.node.id,
    title: row.node.title,
    coverUrl:
      row.node.main_picture?.large ?? row.node.main_picture?.medium ?? null,
    mediaType: row.node.media_type ?? null,
    status: row.node.status ?? null,
    episodes: row.node.num_episodes ?? null,
  }));
}

/**
 * @description Liste animé personnelle MAL (paginée) avec progression.
 * Inclut les entrées NSFW / gray (sinon absentes de la sync API).
 */
export async function fetchMalUserAnimeList(
  accessToken: string,
  limit = 100,
): Promise<MalAnimeListEntry[]> {
  const hits: MalAnimeListEntry[] = [];
  const firstUrl = new URL(`${MAL_API}/users/@me/animelist`);
  firstUrl.searchParams.set(
    "fields",
    "list_status{status,num_episodes_watched,start_date,finish_date,updated_at},num_episodes,main_picture,media_type,status,nsfw",
  );
  firstUrl.searchParams.set("limit", String(limit));
  firstUrl.searchParams.set("nsfw", "true");
  let nextUrl: string | null = firstUrl.toString();

  while (nextUrl) {
    const response = await trackerHttpRequest({
      method: "GET",
      url: nextUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `MAL liste animé HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
      );
    }
    let json: {
      data?: Array<{
        node: {
          id: number;
          title: string;
          main_picture?: { medium?: string; large?: string };
          media_type?: string;
          status?: string;
          num_episodes?: number;
        };
        list_status?: {
          status?: string;
          num_episodes_watched?: number;
          start_date?: string;
          finish_date?: string;
          updated_at?: string;
        } | null;
      }>;
      paging?: { next?: string };
    };
    try {
      json = JSON.parse(response.body) as typeof json;
    } catch {
      throw new Error("Réponse liste animé MAL invalide.");
    }
    for (const row of json.data ?? []) {
      const myStatus = row.list_status ?? null;
      hits.push({
        id: row.node.id,
        title: row.node.title,
        coverUrl:
          row.node.main_picture?.large ?? row.node.main_picture?.medium ?? null,
        mediaType: row.node.media_type ?? null,
        status: row.node.status ?? null,
        episodes: row.node.num_episodes ?? null,
        listStatus: myStatus
          ? {
              mediaId: row.node.id,
              status: myStatus.status
                ? normalizeAnimeListStatus(myStatus.status)
                : null,
              episodesWatched: myStatus.num_episodes_watched ?? null,
              startedAt: myStatus.start_date ?? null,
              finishedAt: myStatus.finish_date ?? null,
              updatedAtMs: parseTrackerTimestamp(myStatus.updated_at),
            }
          : null,
      });
    }
    nextUrl = json.paging?.next ?? null;
  }

  return hits;
}

/**
 * @description Détail animé MAL (champs retenus pour le catalogue local).
 */
export async function fetchMalAnimeDetail(
  accessToken: string,
  animeId: number,
): Promise<MalAnimeDetail> {
  const url = new URL(`${MAL_API}/anime/${animeId}`);
  url.searchParams.set("fields", ANIME_DETAIL_FIELDS);

  const response = await trackerHttpRequest({
    method: "GET",
    url: url.toString(),
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MAL détail animé HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
    );
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    throw new Error("Réponse détail animé MAL invalide.");
  }

  return mapMalAnimeDetail(json);
}

/**
 * @description Progression liste animé MAL.
 */
export async function fetchMalAnimeProgress(
  accessToken: string,
  animeId: number,
): Promise<MalAnimeRemoteProgress | null> {
  const detail = await fetchMalAnimeDetail(accessToken, animeId);
  return detail.listStatus;
}

/**
 * @description Pousse la progression animé vers MAL.
 */
export async function pushMalAnimeProgress(
  accessToken: string,
  animeId: number,
  payload: {
    status: AnimeListStatus;
    episodesWatched: number;
    startedAt?: string | null;
    finishedAt?: string | null;
  },
): Promise<void> {
  const body = new URLSearchParams();
  body.set("status", payload.status);
  body.set("num_watched_episodes", String(payload.episodesWatched));
  if (payload.startedAt) body.set("start_date", payload.startedAt);
  if (payload.finishedAt) body.set("finish_date", payload.finishedAt);

  const response = await trackerHttpRequest({
    method: "PUT",
    url: `${MAL_API}/anime/${animeId}/my_list_status`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MAL push animé HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
    );
  }
}

function mapMalAnimeDetail(json: Record<string, unknown>): MalAnimeDetail {
  const alt = (json.alternative_titles ?? {}) as {
    en?: string;
    ja?: string;
  };
  const picture = (json.main_picture ?? {}) as {
    medium?: string;
    large?: string;
  };
  const seasonObj = (json.start_season ?? null) as {
    season?: string;
    year?: number;
  } | null;
  const broadcast = (json.broadcast ?? null) as {
    day_of_the_week?: string;
    start_time?: string;
  } | null;
  const myStatus = (json.my_list_status ?? null) as {
    status?: string;
    num_episodes_watched?: number;
    start_date?: string;
    finish_date?: string;
    updated_at?: string;
  } | null;

  const relatedAnime = Array.isArray(json.related_anime)
    ? (json.related_anime as Array<{
        node?: {
          id?: number;
          title?: string;
          main_picture?: { medium?: string; large?: string };
        };
        relation_type?: string;
      }>)
    : [];
  const relatedManga = Array.isArray(json.related_manga)
    ? (json.related_manga as Array<{
        node?: {
          id?: number;
          title?: string;
          main_picture?: { medium?: string; large?: string };
        };
        relation_type?: string;
      }>)
    : [];
  const recommendations = Array.isArray(json.recommendations)
    ? (json.recommendations as Array<{
        node?: {
          id?: number;
          title?: string;
          main_picture?: { medium?: string; large?: string };
        };
        num_recommendations?: number;
      }>)
    : [];

  return {
    id: Number(json.id),
    title: String(json.title ?? ""),
    titleEn: alt.en?.trim() || null,
    titleJa: alt.ja?.trim() || null,
    coverUrl: picture.large ?? picture.medium ?? null,
    mediaType: json.media_type ? String(json.media_type) : null,
    source: json.source ? String(json.source) : null,
    status: json.status ? String(json.status) : null,
    season: seasonObj?.season ?? null,
    year: seasonObj?.year ?? null,
    episodes:
      typeof json.num_episodes === "number" ? json.num_episodes : null,
    durationSeconds:
      typeof json.average_episode_duration === "number"
        ? json.average_episode_duration
        : null,
    broadcastDay: broadcast?.day_of_the_week ?? null,
    broadcastTime: broadcast?.start_time ?? null,
    rating: json.rating ? String(json.rating) : null,
    nsfw: json.nsfw ? String(json.nsfw) : null,
    synopsis: json.synopsis ? String(json.synopsis) : null,
    genres: Array.isArray(json.genres)
      ? (json.genres as Array<{ name?: string }>)
          .map((g) => g.name)
          .filter((n): n is string => Boolean(n))
      : [],
    studios: Array.isArray(json.studios)
      ? (json.studios as Array<{ name?: string }>)
          .map((s) => s.name)
          .filter((n): n is string => Boolean(n))
      : [],
    pictures: Array.isArray(json.pictures)
      ? (json.pictures as Array<{ medium?: string; large?: string }>)
      : [],
    related: [
      ...relatedAnime.map((r) => ({
        malId: Number(r.node?.id),
        type: "anime" as const,
        name: String(r.node?.title ?? ""),
        relation: String(r.relation_type ?? "other"),
        image:
          r.node?.main_picture?.large ?? r.node?.main_picture?.medium ?? null,
      })),
      ...relatedManga.map((r) => ({
        malId: Number(r.node?.id),
        type: "manga" as const,
        name: String(r.node?.title ?? ""),
        relation: String(r.relation_type ?? "other"),
        image:
          r.node?.main_picture?.large ?? r.node?.main_picture?.medium ?? null,
      })),
    ].filter((r) => Number.isFinite(r.malId) && r.malId > 0),
    recommendations: recommendations
      .map((r) => ({
        malId: Number(r.node?.id),
        title: String(r.node?.title ?? ""),
        votes: Number(r.num_recommendations ?? 0),
        image:
          r.node?.main_picture?.large ?? r.node?.main_picture?.medium ?? null,
      }))
      .filter((r) => Number.isFinite(r.malId) && r.malId > 0),
    listStatus: myStatus
      ? {
          mediaId: Number(json.id),
          status: myStatus.status
            ? normalizeAnimeListStatus(myStatus.status)
            : null,
          episodesWatched: myStatus.num_episodes_watched ?? null,
          startedAt: myStatus.start_date ?? null,
          finishedAt: myStatus.finish_date ?? null,
          updatedAtMs: parseTrackerTimestamp(myStatus.updated_at),
        }
      : null,
  };
}
