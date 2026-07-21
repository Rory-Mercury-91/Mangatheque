import { trackerHttpRequest } from "@/services/tracker/oauthHttp";
import type {
  TrackerMangaListEntry,
  TrackerRemoteProgress,
} from "@/types/tracker";
import { parseTrackerTimestamp } from "@/utils/trackerTimestamp";

const ANILIST_GRAPHQL = "https://graphql.anilist.co";

/**
 * @description Profil Viewer AniList.
 */
export async function fetchAniListViewer(accessToken: string): Promise<{
  id: number;
  name: string;
}> {
  const data = await anilistQuery<{
    Viewer: { id: number; name: string };
  }>(accessToken, `query { Viewer { id name } }`);
  return data.Viewer;
}

/**
 * @description Progression manga AniList du compte authentifié pour un mediaId.
 *
 * Important (doc AniList) : `MediaList(mediaId)` seul n'infère PAS l'utilisateur
 * connecté. On utilise `Media.mediaListEntry` (lié au Bearer).
 * Si le média existe mais n'est pas dans la liste perso → `null` (sans throw),
 * pour permettre un push/création ensuite.
 */
export async function fetchAniListMangaProgress(
  accessToken: string,
  mediaId: number,
): Promise<TrackerRemoteProgress | null> {
  const viaMedia = await anilistQuery<{
    Media: {
      id: number;
      mediaListEntry: {
        progress: number | null;
        progressVolumes: number | null;
        status: string | null;
        updatedAt: number | null;
      } | null;
    } | null;
  }>(
    accessToken,
    `query ($mediaId: Int) {
      Media(id: $mediaId, type: MANGA) {
        id
        mediaListEntry {
          progress
          progressVolumes
          status
          updatedAt
        }
      }
    }`,
    { mediaId },
  );

  const media = viaMedia.Media;
  if (!media) {
    return null;
  }

  const entry = media.mediaListEntry;
  // Média connu mais absent de la liste perso — ne pas passer par MediaList
  // (AniList renvoie souvent une erreur « Not Found » qui cassait le push).
  if (!entry) {
    return null;
  }

  return {
    provider: "anilist",
    mediaId: media.id,
    chaptersRead: entry.progress,
    volumesRead: entry.progressVolumes,
    status: entry.status,
    updatedAtMs: parseTrackerTimestamp(entry.updatedAt),
  };
}

/**
 * @description Résout le MAL ID depuis un media AniList (query publique).
 * @param anilistId - Identifiant media AniList.
 * @returns MAL ID ou null si absent / introuvable.
 */
export async function resolveMalIdFromAniList(
  anilistId: number,
): Promise<number | null> {
  const data = await anilistQueryPublic<{
    Media: { id: number; idMal: number | null } | null;
  }>(
    `query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        idMal
      }
    }`,
    { id: anilistId },
  );
  return data.Media?.idMal ?? null;
}

/**
 * @description Résout l'ID AniList depuis un MAL ID (query publique).
 * @param malId - Identifiant manga MyAnimeList.
 * @returns AniList ID ou null si introuvable.
 */
export async function resolveAniListIdFromMal(
  malId: number,
): Promise<number | null> {
  const data = await anilistQueryPublic<{
    Media: { id: number; idMal: number | null } | null;
  }>(
    `query ($idMal: Int) {
      Media(idMal: $idMal, type: MANGA) {
        id
        idMal
      }
    }`,
    { idMal: malId },
  );
  return data.Media?.id ?? null;
}

/**
 * @description Charge la liste manga personnelle AniList du compte authentifié.
 * @param accessToken - Bearer OAuth AniList.
 */
export async function fetchAniListUserMangaList(
  accessToken: string,
): Promise<TrackerMangaListEntry[]> {
  const viewer = await fetchAniListViewer(accessToken);
  const data = await anilistQuery<{
    MediaListCollection: {
      lists: Array<{
        entries: Array<{
          media: {
            id: number;
            idMal: number | null;
            title: {
              romaji: string | null;
              english: string | null;
              native: string | null;
            } | null;
            synonyms: string[] | null;
          } | null;
        } | null> | null;
      } | null> | null;
    } | null;
  }>(
    accessToken,
    `query ($userId: Int) {
      MediaListCollection(userId: $userId, type: MANGA) {
        lists {
          entries {
            media {
              id
              idMal
              title {
                romaji
                english
                native
              }
              synonyms
            }
          }
        }
      }
    }`,
    { userId: viewer.id },
  );

  const byId = new Map<number, TrackerMangaListEntry>();
  for (const list of data.MediaListCollection?.lists ?? []) {
    for (const entry of list?.entries ?? []) {
      const media = entry?.media;
      if (!media?.id) {
        continue;
      }
      if (byId.has(media.id)) {
        continue;
      }
      const searchTitles = [
        media.title?.romaji,
        media.title?.english,
        media.title?.native,
        ...(media.synonyms ?? []),
      ].filter((value): value is string => Boolean(value?.trim()));

      const title =
        media.title?.english?.trim() ||
        media.title?.romaji?.trim() ||
        media.title?.native?.trim() ||
        `AniList #${media.id}`;

      byId.set(media.id, {
        provider: "anilist",
        mediaId: media.id,
        malId: media.idMal ?? null,
        anilistId: media.id,
        title,
        searchTitles,
      });
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "fr", { sensitivity: "base" }),
  );
}

/**
 * @description Recherche manga dans le catalogue AniList (hors liste perso).
 * @param search - Texte libre (titre / synonyme).
 */
export async function searchAniListMangaCatalog(
  search: string,
  accessToken?: string | null,
): Promise<TrackerMangaListEntry[]> {
  const trimmed = search.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const data = await anilistQuery<{
    Page: {
      media: Array<{
        id: number;
        idMal: number | null;
        title: {
          romaji: string | null;
          english: string | null;
          native: string | null;
        } | null;
        synonyms: string[] | null;
      } | null> | null;
    } | null;
  }>(
    accessToken ?? null,
    `query ($search: String) {
      Page(page: 1, perPage: 25) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          synonyms
        }
      }
    }`,
    { search: trimmed },
  );

  const entries: TrackerMangaListEntry[] = [];
  for (const media of data.Page?.media ?? []) {
    if (!media?.id) {
      continue;
    }
    const searchTitles = [
      media.title?.romaji,
      media.title?.english,
      media.title?.native,
      ...(media.synonyms ?? []),
    ].filter((value): value is string => Boolean(value?.trim()));

    const title =
      media.title?.english?.trim() ||
      media.title?.romaji?.trim() ||
      media.title?.native?.trim() ||
      `AniList #${media.id}`;

    entries.push({
      provider: "anilist",
      mediaId: media.id,
      malId: media.idMal ?? null,
      anilistId: media.id,
      title,
      searchTitles,
    });
  }
  return entries;
}

/**
 * @description Met à jour (ou crée) la progression manga sur la liste AniList.
 * Pour une création, passer `status` (ex. CURRENT) — requis par AniList.
 */
export async function pushAniListMangaProgress(
  accessToken: string,
  mediaId: number,
  progress: {
    chaptersRead?: number | null;
    volumesRead?: number | null;
    status?: string | null;
  },
): Promise<void> {
  const variables: Record<string, unknown> = { mediaId };
  const fieldArgs = ["mediaId: $mediaId"];
  const varDefs = ["$mediaId: Int"];

  if (progress.status?.trim()) {
    variables.status = progress.status.trim();
    varDefs.push("$status: MediaListStatus");
    fieldArgs.push("status: $status");
  }

  if (progress.chaptersRead != null && Number.isFinite(progress.chaptersRead)) {
    variables.progress = Math.max(0, Math.floor(progress.chaptersRead));
    varDefs.push("$progress: Int");
    fieldArgs.push("progress: $progress");
  }

  if (progress.volumesRead != null && Number.isFinite(progress.volumesRead)) {
    variables.progressVolumes = Math.max(0, Math.floor(progress.volumesRead));
    varDefs.push("$progressVolumes: Int");
    fieldArgs.push("progressVolumes: $progressVolumes");
  }

  if (fieldArgs.length <= 1) {
    throw new Error("Push AniList : aucun champ de progression à envoyer.");
  }

  const data = await anilistQuery<{
    SaveMediaListEntry: { id: number } | null;
  }>(
    accessToken,
    `mutation (${varDefs.join(", ")}) {
      SaveMediaListEntry(${fieldArgs.join(", ")}) {
        id
      }
    }`,
    variables,
  );

  if (!data.SaveMediaListEntry?.id) {
    throw new Error("AniList n'a pas créé/mis à jour l'entrée de liste.");
  }
}

async function anilistQueryPublic<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return anilistQuery<T>(null, query, variables);
}

async function anilistQuery<T>(
  accessToken: string | null,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await trackerHttpRequest({
    method: "POST",
    url: ANILIST_GRAPHQL,
    contentType: "application/json",
    headers: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : undefined,
    body: JSON.stringify({ query, variables }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`AniList HTTP ${response.status}`);
  }

  let json: {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  try {
    json = JSON.parse(response.body) as typeof json;
  } catch {
    throw new Error("Réponse AniList invalide.");
  }

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "Erreur AniList.");
  }
  if (!json.data) {
    throw new Error("Réponse AniList vide.");
  }
  return json.data;
}
