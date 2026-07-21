import { trackerHttpRequest } from "@/services/tracker/oauthHttp";
import type {
  TrackerMangaListEntry,
  TrackerRemoteProgress,
} from "@/types/tracker";
import { parseTrackerTimestamp } from "@/utils/trackerTimestamp";

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
    "my_list_status{status,num_chapters_read,num_volumes_read,updated_at}",
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
      updated_at?: string;
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
    updatedAtMs: parseTrackerTimestamp(status.updated_at),
  };
}

interface MalMangaListPage {
  data?: Array<{
    node?: {
      id: number;
      title?: string;
      alternative_titles?: {
        synonyms?: string[];
        en?: string;
        ja?: string;
      };
    };
  }>;
  paging?: {
    next?: string;
  };
}

/**
 * @description Charge la liste manga personnelle MAL du compte authentifié.
 * @param accessToken - Bearer OAuth MAL.
 */
export async function fetchMalUserMangaList(
  accessToken: string,
): Promise<TrackerMangaListEntry[]> {
  const entries: TrackerMangaListEntry[] = [];
  let nextUrl: string | null = (() => {
    const url = new URL(`${MAL_API}/users/@me/mangalist`);
    url.searchParams.set(
      "fields",
      "list_status,alternative_titles",
    );
    url.searchParams.set("limit", "1000");
    url.searchParams.set("nsfw", "true");
    return url.toString();
  })();

  while (nextUrl) {
    const response = await trackerHttpRequest({
      method: "GET",
      url: nextUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `MAL liste manga HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
      );
    }

    let json: MalMangaListPage;
    try {
      json = JSON.parse(response.body) as MalMangaListPage;
    } catch {
      throw new Error("Réponse liste manga MAL invalide.");
    }

    for (const row of json.data ?? []) {
      const node = row.node;
      if (!node?.id) {
        continue;
      }
      const alt = node.alternative_titles;
      const searchTitles = [
        node.title,
        alt?.en,
        alt?.ja,
        ...(alt?.synonyms ?? []),
      ].filter((value): value is string => Boolean(value?.trim()));

      const title =
        node.title?.trim() ||
        alt?.en?.trim() ||
        `MAL #${node.id}`;

      entries.push({
        provider: "mal",
        mediaId: node.id,
        malId: node.id,
        anilistId: null,
        title,
        searchTitles,
      });
    }

    nextUrl = json.paging?.next ?? null;
  }

  return entries.sort((a, b) =>
    a.title.localeCompare(b.title, "fr", { sensitivity: "base" }),
  );
}

/**
 * @description Recherche manga dans le catalogue MAL (hors liste perso).
 */
export async function searchMalMangaCatalog(
  accessToken: string,
  search: string,
): Promise<TrackerMangaListEntry[]> {
  const trimmed = search.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const url = new URL(`${MAL_API}/manga`);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "25");
  url.searchParams.set("nsfw", "true");
  url.searchParams.set("fields", "alternative_titles");

  const response = await trackerHttpRequest({
    method: "GET",
    url: url.toString(),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MAL recherche HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
    );
  }

  let json: {
    data?: Array<{
      node?: {
        id: number;
        title?: string;
        alternative_titles?: {
          synonyms?: string[];
          en?: string;
          ja?: string;
        };
      };
    }>;
  };
  try {
    json = JSON.parse(response.body) as typeof json;
  } catch {
    throw new Error("Réponse recherche MAL invalide.");
  }

  const entries: TrackerMangaListEntry[] = [];
  for (const row of json.data ?? []) {
    const node = row.node;
    if (!node?.id) {
      continue;
    }
    const alt = node.alternative_titles;
    const searchTitles = [
      node.title,
      alt?.en,
      alt?.ja,
      ...(alt?.synonyms ?? []),
    ].filter((value): value is string => Boolean(value?.trim()));

    entries.push({
      provider: "mal",
      mediaId: node.id,
      malId: node.id,
      anilistId: null,
      title: node.title?.trim() || alt?.en?.trim() || `MAL #${node.id}`,
      searchTitles,
    });
  }
  return entries;
}

/**
 * @description Met à jour (ou crée) la progression manga sur la liste MAL.
 * N'envoie que les champs fournis. Ne baisse jamais volontairement ici :
 * l'appelant doit déjà avoir calculé un max.
 */
export async function pushMalMangaProgress(
  accessToken: string,
  mangaId: number,
  progress: {
    chaptersRead?: number | null;
    volumesRead?: number | null;
    status?: string | null;
  },
): Promise<void> {
  const body = new URLSearchParams();
  if (progress.chaptersRead != null && Number.isFinite(progress.chaptersRead)) {
    body.set(
      "num_chapters_read",
      String(Math.max(0, Math.floor(progress.chaptersRead))),
    );
  }
  if (progress.volumesRead != null && Number.isFinite(progress.volumesRead)) {
    body.set(
      "num_volumes_read",
      String(Math.max(0, Math.floor(progress.volumesRead))),
    );
  }
  if (progress.status?.trim()) {
    body.set("status", progress.status.trim());
  }

  if ([...body.keys()].length === 0) {
    return;
  }

  const response = await trackerHttpRequest({
    method: "PATCH",
    url: `${MAL_API}/manga/${mangaId}/my_list_status`,
    contentType: "application/x-www-form-urlencoded",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: body.toString(),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `MAL écriture HTTP ${response.status}${response.body ? ` : ${response.body}` : ""}`,
    );
  }
}
