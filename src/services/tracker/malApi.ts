import { trackerHttpRequest } from "@/services/tracker/oauthHttp";
import type { TrackerRemoteProgress } from "@/types/tracker";

const MAL_API = "https://api.myanimelist.net/v2";

/**
 * @description Profil utilisateur MAL.
 */
export async function fetchMalViewer(accessToken: string): Promise<{
  id: number;
  name: string;
}> {
  const response = await trackerHttpRequest({
    method: "GET",
    url: `${MAL_API}/users/@me`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MAL profil HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
    );
  }

  let json: { id: number; name: string };
  try {
    json = JSON.parse(response.body) as typeof json;
  } catch {
    throw new Error("Réponse profil MAL invalide.");
  }
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

  const response = await trackerHttpRequest({
    method: "GET",
    url: url.toString(),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MAL manga HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
    );
  }

  let json: {
    id: number;
    my_list_status?: {
      status?: string;
      num_chapters_read?: number;
      num_volumes_read?: number;
    } | null;
  };
  try {
    json = JSON.parse(response.body) as typeof json;
  } catch {
    throw new Error("Réponse manga MAL invalide.");
  }

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
