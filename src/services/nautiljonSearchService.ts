import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/platform";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import type { Owner } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";
import { resolveErrorMessage } from "@/utils/errorMessage";
import { parseNautiljonMangaPageHtml } from "@/utils/nautiljonPageParser";
import {
  buildNautiljonSearchUrl,
  buildNautiljonWebSearchUrl,
  formatNautiljonSearchHitLabel,
  parseNautiljonSearchHtml,
  rankNautiljonSearchHits,
  scoreNautiljonSearchHit,
  type NautiljonSearchHit,
  type NautiljonSearchKind,
} from "@/utils/nautiljonSearchParser";

export type { NautiljonSearchHit, NautiljonSearchKind };
export {
  buildNautiljonSearchUrl,
  buildNautiljonWebSearchUrl,
  formatNautiljonSearchHitLabel,
  scoreNautiljonSearchHit,
};

/**
 * @description Télécharge le HTML de recherche web (DuckDuckGo → Nautiljon).
 * @param query - Titre recherché.
 * @param kind - Catalogue manga ou anime.
 */
export async function fetchNautiljonSearchHtml(
  query: string,
  kind: NautiljonSearchKind,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error(
      "La recherche Nautiljon nécessite l'application native.",
    );
  }
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Saisissez un titre pour la recherche Nautiljon.");
  }
  try {
    return await invoke<string>("fetch_nautiljon_search_html", {
      query: trimmed,
      kind,
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Recherche Nautiljon impossible."),
    );
  }
}

/**
 * @description Recherche des fiches Nautiljon via index web (contourne Cloudflare).
 * @param query - Titre recherché.
 * @param kind - Catalogue manga ou anime.
 */
export async function searchNautiljon(
  query: string,
  kind: NautiljonSearchKind,
): Promise<NautiljonSearchHit[]> {
  const html = await fetchNautiljonSearchHtml(query, kind);
  return rankNautiljonSearchHits(parseNautiljonSearchHtml(html, kind), query);
}

/**
 * @description Télécharge le HTML d'une fiche Nautiljon (WebView).
 * @param pageUrl - URL fiche série.
 */
export async function fetchNautiljonPageHtml(pageUrl: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("L'import Nautiljon nécessite l'application native.");
  }
  const trimmed = pageUrl.trim();
  if (!trimmed) {
    throw new Error("URL Nautiljon manquante.");
  }
  try {
    return await invoke<string>("fetch_nautiljon_page_html", {
      url: trimmed,
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Impossible de charger la fiche Nautiljon."),
    );
  }
}

/**
 * @description Importe les métadonnées d'une fiche Nautiljon vers des valeurs de formulaire.
 * @param pageUrl - URL de la fiche.
 * @param owners - Propriétaires du foyer (appartenances).
 */
export async function importWorkFormFromNautiljonUrl(
  pageUrl: string,
  owners: Owner[] = [],
): Promise<WorkFormValues> {
  const html = await fetchNautiljonPageHtml(pageUrl);
  const payload = parseNautiljonMangaPageHtml(html, pageUrl);
  return scrapePayloadToFormValues(payload, owners);
}

/**
 * @description Fusionne un import Nautiljon dans un formulaire existant
 * (préserve titre / IDs déjà saisis si présents).
 * @param current - Formulaire actuel.
 * @param imported - Valeurs issues du scrape.
 * @param options.preferImportedVolumes - Si true, remplace les tomes par ceux du scrape.
 */
export function mergeNautiljonImportIntoForm(
  current: WorkFormValues,
  imported: WorkFormValues,
  options?: { preferImportedVolumes?: boolean },
): WorkFormValues {
  const preferImportedVolumes = Boolean(options?.preferImportedVolumes);
  return {
    ...current,
    title: current.title.trim() || imported.title,
    demographicType: current.demographicType.trim() || imported.demographicType,
    genres: current.genres.length > 0 ? current.genres : imported.genres,
    themes: current.themes.length > 0 ? current.themes : imported.themes,
    publisherVf: current.publisherVf.trim() || imported.publisherVf,
    volumesVfCount: current.volumesVfCount ?? imported.volumesVfCount,
    volumesVoTotal: current.volumesVoTotal ?? imported.volumesVoTotal,
    synopsis: current.synopsis.trim() || imported.synopsis,
    coverUrl: current.coverUrl.trim() || imported.coverUrl,
    sourceUrl: imported.sourceUrl || current.sourceUrl,
    readingStatus: (imported.readingStatus ?? current.readingStatus) as WorkFormValues["readingStatus"],
    hasVolumeTracking:
      current.hasVolumeTracking || imported.hasVolumeTracking,
    volumes:
      preferImportedVolumes && imported.volumes.length > 0
        ? imported.volumes
        : current.volumes.length > 0
          ? current.volumes
          : imported.volumes,
  };
}
