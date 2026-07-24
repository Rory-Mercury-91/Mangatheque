import { trackerHttpRequest } from "@/services/tracker/oauthHttp";

const ANILIST_GRAPHQL = "https://graphql.anilist.co";

type AniListMediaType = "ANIME" | "MANGA";

const coverCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let queue: Promise<void> = Promise.resolve();

/**
 * @description Limite le débit des appels AniList (évite les 429).
 */
function enqueueAniListTask<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * @description Récupère une cover haute qualité AniList via MAL ID (API publique).
 * @param malId - Identifiant MyAnimeList.
 * @param mediaType - Type média AniList.
 */
export async function fetchAniListCoverByMalId(
  malId: number,
  mediaType: AniListMediaType = "ANIME",
): Promise<string | null> {
  if (!Number.isFinite(malId) || malId <= 0) return null;

  const cacheKey = `${mediaType}:${malId}`;
  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey) ?? null;
  }

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const request = enqueueAniListTask(async () => {
    try {
      const response = await trackerHttpRequest({
        method: "POST",
        url: ANILIST_GRAPHQL,
        contentType: "application/json",
        body: JSON.stringify({
          query: `
            query ($idMal: Int, $type: MediaType) {
              Media(idMal: $idMal, type: $type) {
                coverImage {
                  extraLarge
                  large
                  medium
                }
              }
            }
          `,
          variables: { idMal: malId, type: mediaType },
        }),
      });

      if (response.status < 200 || response.status >= 300) {
        coverCache.set(cacheKey, null);
        return null;
      }

      const json = JSON.parse(response.body) as {
        data?: {
          Media?: {
            coverImage?: {
              extraLarge?: string | null;
              large?: string | null;
              medium?: string | null;
            } | null;
          } | null;
        };
      };

      const cover = json.data?.Media?.coverImage;
      const url =
        cover?.extraLarge?.trim() ||
        cover?.large?.trim() ||
        cover?.medium?.trim() ||
        null;
      coverCache.set(cacheKey, url);
      return url;
    } catch {
      coverCache.set(cacheKey, null);
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  });

  inflight.set(cacheKey, request);
  return request;
}

/**
 * @description Choisit la meilleure cover : AniList (extraLarge) prioritaire, sinon fallback MAL.
 */
export async function resolveBestAnimeCoverUrl(options: {
  malId: number;
  mediaType?: AniListMediaType;
  fallbackUrl?: string | null;
}): Promise<string | null> {
  const fallback = options.fallbackUrl?.trim() || null;
  const anilist = await fetchAniListCoverByMalId(
    options.malId,
    options.mediaType ?? "ANIME",
  );
  return anilist ?? fallback;
}
