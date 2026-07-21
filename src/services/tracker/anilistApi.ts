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
  }>(
    accessToken,
    `query { Viewer { id name } }`,
  );
  return data.Viewer;
}

/**
 * @description Progression manga AniList pour un mediaId.
 */
export async function fetchAniListMangaProgress(
  accessToken: string,
  mediaId: number,
): Promise<TrackerRemoteProgress | null> {
  const data = await anilistQuery<{
    MediaList: {
      progress: number | null;
      progressVolumes: number | null;
      status: string | null;
      media: { id: number };
    } | null;
  }>(
    accessToken,
    `query ($mediaId: Int) {
      MediaList(mediaId: $mediaId, type: MANGA) {
        progress
        progressVolumes
        status
        media { id }
      }
    }`,
    { mediaId },
  );

  const entry = data.MediaList;
  if (!entry) {
    return null;
  }

  return {
    provider: "anilist",
    mediaId: entry.media.id,
    chaptersRead: entry.progress,
    volumesRead: entry.progressVolumes,
    status: entry.status,
  };
}

async function anilistQuery<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(ANILIST_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`AniList HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "Erreur AniList.");
  }
  if (!json.data) {
    throw new Error("Réponse AniList vide.");
  }
  return json.data;
}
