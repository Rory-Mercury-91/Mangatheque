import { trackerHttpRequest } from "@/services/tracker/oauthHttp";
import type { TrackerRemoteProgress } from "@/types/tracker";

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
 * connecté et peut renvoyer l'entrée d'un autre compte. On utilise
 * `Media.mediaListEntry` (lié au Bearer) ou `MediaList(userId, mediaId)`.
 */
export async function fetchAniListMangaProgress(
  accessToken: string,
  mediaId: number,
): Promise<TrackerRemoteProgress | null> {
  // Méthode recommandée : mediaListEntry sur Media (toujours le Viewer auth)
  const viaMedia = await anilistQuery<{
    Media: {
      id: number;
      mediaListEntry: {
        progress: number | null;
        progressVolumes: number | null;
        status: string | null;
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
        }
      }
    }`,
    { mediaId },
  );

  const entry = viaMedia.Media?.mediaListEntry;
  if (entry) {
    return {
      provider: "anilist",
      mediaId: viaMedia.Media!.id,
      chaptersRead: entry.progress,
      volumesRead: entry.progressVolumes,
      status: entry.status,
    };
  }

  // Repli : MediaList avec userId Viewer explicite
  const viewer = await fetchAniListViewer(accessToken);
  const viaList = await anilistQuery<{
    MediaList: {
      progress: number | null;
      progressVolumes: number | null;
      status: string | null;
      media: { id: number };
    } | null;
  }>(
    accessToken,
    `query ($userId: Int, $mediaId: Int) {
      MediaList(userId: $userId, mediaId: $mediaId, type: MANGA) {
        progress
        progressVolumes
        status
        media { id }
      }
    }`,
    { userId: viewer.id, mediaId },
  );

  const listEntry = viaList.MediaList;
  if (!listEntry) {
    return null;
  }

  return {
    provider: "anilist",
    mediaId: listEntry.media.id,
    chaptersRead: listEntry.progress,
    volumesRead: listEntry.progressVolumes,
    status: listEntry.status,
  };
}

async function anilistQuery<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await trackerHttpRequest({
    method: "POST",
    url: ANILIST_GRAPHQL,
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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
