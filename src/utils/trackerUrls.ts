/**
 * @description Construit l'URL publique MyAnimeList d'un manga.
 * @param malId - Identifiant manga MAL.
 */
export function buildMalMangaUrl(malId: number): string {
  return `https://myanimelist.net/manga/${malId}`;
}

/**
 * @description Construit l'URL publique AniList d'un manga.
 * @param anilistId - Identifiant media AniList.
 */
export function buildAniListMangaUrl(anilistId: number): string {
  return `https://anilist.co/manga/${anilistId}`;
}
