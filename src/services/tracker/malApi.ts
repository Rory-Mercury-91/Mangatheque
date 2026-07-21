import type { TrackerRemoteProgress } from "@/types/tracker";

const MAL_API = "https://api.myanimelist.net/v2";

/**
 * @description Profil utilisateur MAL.
 */
export async function fetchMalViewer(accessToken: string): Promise<{
  id: number;
  name: string;
}> {
  const response = await fetch(`${MAL_API}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`MAL profil HTTP ${response.status}`);
  }

  const json = (await response.json()) as { id: number; name: string };
  return { id: json.id, name: json.name };
}

/**
 * @description Progression manga MAL pour un mangaId.
 */
export async function fetchMalMangaProgress(
  accessToken: string,
  mangaId: number,
): Promise<TrackerRemoteProgress | null> {
  const url = new URL(`${MAL_API}/manga/${mangaId}`);
  url.searchParams.set(
    "fields",
    "my_list_status{status,num_chapters_read,num_volumes_read}",
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`MAL manga HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    id: number;
    my_list_status?: {
      status?: string;
      num_chapters_read?: number;
      num_volumes_read?: number;
    } | null;
  };

  const status = json.my_list_status;
  if (!status) {
    return null;
  }

  return {
    provider: "mal",
    mediaId: json.id,
    chaptersRead: status.num_chapters_read ?? null,
    volumesRead: status.num_volumes_read ?? null,
    status: status.status ?? null,
  };
}
