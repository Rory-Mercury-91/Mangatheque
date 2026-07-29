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
 * @description Fusionne un import Nautiljon dans un formulaire existant.
 * La couverture Nautiljon prime toujours si fournie ; les compteurs / flags
 * chapitres et tomes du scrape sont pris en compte.
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
  const hasVolumeTracking =
    current.hasVolumeTracking || imported.hasVolumeTracking;
  const hasChapterTracking =
    current.hasChapterTracking || imported.hasChapterTracking;
  const importedCover = imported.coverUrl.trim();

  let volumes = current.volumes;
  if (preferImportedVolumes && imported.volumes.length > 0) {
    volumes = imported.volumes;
  } else if (current.volumes.length === 0 && imported.volumes.length > 0) {
    volumes = imported.volumes;
  } else if (
    preferImportedVolumes &&
    imported.hasChapterTracking &&
    !imported.hasVolumeTracking
  ) {
    // Chapitres seuls : ne pas conserver d'anciens tomes vides Mihon.
    volumes = imported.volumes;
  }

  return {
    ...current,
    title: current.title.trim() || imported.title,
    demographicType:
      imported.demographicType.trim() || current.demographicType,
    genres: imported.genres.length > 0 ? imported.genres : current.genres,
    themes: imported.themes.length > 0 ? imported.themes : current.themes,
    publisherVf: imported.publisherVf.trim() || current.publisherVf,
    publisherVfChapter:
      imported.publisherVfChapter.trim() || current.publisherVfChapter,
    volumesVfCount: imported.volumesVfCount ?? current.volumesVfCount,
    volumesVoTotal: imported.volumesVoTotal ?? current.volumesVoTotal,
    chaptersVfCount: imported.chaptersVfCount ?? current.chaptersVfCount,
    chaptersVoTotal: imported.chaptersVoTotal ?? current.chaptersVoTotal,
    synopsis: imported.synopsis.trim() || current.synopsis,
    // Toujours préférer la cover Nautiljon quand elle est présente.
    coverUrl: importedCover || current.coverUrl,
    sourceUrl: imported.sourceUrl || current.sourceUrl,
    readingStatus: (imported.readingStatus ??
      current.readingStatus) as WorkFormValues["readingStatus"],
    hasVolumeTracking,
    hasChapterTracking,
    trackingUnit:
      hasChapterTracking && !hasVolumeTracking ? "chapter" : "volume",
    defaultPrice: imported.defaultPrice ?? current.defaultPrice,
    priceFormat: imported.hasVolumeTracking
      ? (imported.priceFormat ?? current.priceFormat)
      : current.priceFormat,
    chapterPriceFormat: imported.hasChapterTracking
      ? (imported.chapterPriceFormat ?? current.chapterPriceFormat)
      : current.chapterPriceFormat,
    volumes,
  };
}
