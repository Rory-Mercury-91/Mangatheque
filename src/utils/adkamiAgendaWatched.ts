/**
 * @description Indique si l'épisode agenda est déjà vu (compteur MAL / local).
 * Les sorties futures ne sont jamais considérées comme vues.
 * @param episodeNumber - Numéro d'épisode de la case agenda.
 * @param episodesWatched - Compteur d'épisodes déjà vus pour la série.
 * @param releaseAt - Date/heure de diffusion (ISO) ; si future, retourne false.
 */
export function isAgendaEpisodeWatched(
  episodeNumber: number | null | undefined,
  episodesWatched: number | null | undefined,
  releaseAt?: string | Date | null,
): boolean {
  if (episodeNumber == null || episodeNumber <= 0) return false;
  if (releaseAt != null) {
    const release =
      typeof releaseAt === "string" ? new Date(releaseAt) : releaseAt;
    if (!Number.isNaN(release.getTime()) && release.getTime() > Date.now()) {
      return false;
    }
  }
  return (episodesWatched ?? 0) >= episodeNumber;
}
