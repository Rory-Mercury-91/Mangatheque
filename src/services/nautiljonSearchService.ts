import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/platform";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import { getNautiljonBridgeInvokeArgs } from "@/services/nautiljonBridgeService";
import type { Owner, ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";
import { resolveErrorMessage } from "@/utils/errorMessage";
import { absolutizeNautiljonUrl } from "@/utils/nautiljonSearchParser";
import {
  extractNautiljonVolumeDetailsFromHtml,
  parseNautiljonMangaPageHtml,
} from "@/utils/nautiljonPageParser";
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
 * @description Télécharge le HTML de la BDD Nautiljon (WebView bureau).
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
      ...getNautiljonBridgeInvokeArgs(),
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Recherche Nautiljon impossible."),
    );
  }
}

/**
 * @description Recherche des fiches sur la BDD Nautiljon (WebView = navigateur réel).
 * Contourne Cloudflare sans scrap HTTP (plus de DDG/Brave).
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
      ...getNautiljonBridgeInvokeArgs(),
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
  const payload = finalizeNautiljonScrapePayload(html, pageUrl);
  return scrapePayloadToFormValues(payload, owners);
}

/** Progression d'enrichissement des fiches tome (hors écran). */
export interface NautiljonVolumeEnrichProgress {
  current: number;
  total: number;
  label: string;
}

/**
 * @description Complète les tomes incomplets via leurs fiches individuelles (WebView hors écran).
 * @param payload - Payload série déjà parsé.
 * @param onProgress - Barre de progression optionnelle.
 */
export async function enrichNautiljonVolumeDetails(
  payload: ScrapePayloadV1,
  onProgress?: (progress: NautiljonVolumeEnrichProgress) => void,
): Promise<ScrapePayloadV1> {
  const volumes = payload.volumes;
  if (!volumes?.length) {
    return payload;
  }

  const targets = volumes
    .map((volume, index) => ({ volume, index }))
    .filter(
      ({ volume }) =>
        !volume.coverUrl?.trim() ||
        !volume.releaseDate?.trim() ||
        volume.catalogPrice == null,
    );

  if (targets.length === 0) {
    return payload;
  }

  // Résout les URLs manquantes via la fiche série (une seule fois).
  const missingUrl = targets.some(({ volume }) => !volume.pageUrl?.trim());
  let pageUrlByNumber = new Map<number, string>();
  if (missingUrl && payload.sourceUrl?.trim()) {
    try {
      const seriesHtml = await fetchNautiljonPageHtml(payload.sourceUrl);
      const seriesSlug = payload.sourceUrl.match(
        /nautiljon\.com\/(?:mangas|animes|artbook|manhwa|manhua)\/([^/?#]+)\.html/i,
      )?.[1];
      if (seriesSlug) {
        const escaped = seriesSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(
          `href="(/[^"]*/${escaped}/volume-(\\d+)(?:,\\d+)?\\.html)"`,
          "gi",
        );
        let match: RegExpExecArray | null;
        while ((match = re.exec(seriesHtml)) != null) {
          const num = Number(match[2]);
          const href = match[1];
          if (!Number.isFinite(num) || !href || pageUrlByNumber.has(num)) continue;
          pageUrlByNumber.set(num, absolutizeNautiljonUrl(href));
        }
      }
    } catch (error) {
      console.warn(
        "Résolution URLs tomes Nautiljon :",
        resolveErrorMessage(error, "ignorée"),
      );
    }
  }

  const nextVolumes = [...volumes];
  const total = targets.length;

  for (let step = 0; step < targets.length; step += 1) {
    const { volume, index } = targets[step]!;
    const num = volume.volumeNumber;
    const volumeUrl =
      volume.pageUrl?.trim() ||
      (num != null ? pageUrlByNumber.get(num) : undefined);

    onProgress?.({
      current: step + 1,
      total,
      label:
        num != null
          ? `Tome ${num} (${step + 1}/${total})`
          : `Tome ${step + 1}/${total}`,
    });

    if (!volumeUrl) continue;

    try {
      const html = await fetchNautiljonPageHtml(volumeUrl);
      const details = extractNautiljonVolumeDetailsFromHtml(html);
      nextVolumes[index] = {
        ...volume,
        pageUrl: volume.pageUrl || volumeUrl,
        coverUrl: volume.coverUrl?.trim() || details.coverUrl || undefined,
        releaseDate:
          volume.releaseDate?.trim() || details.releaseDate || undefined,
        catalogPrice: volume.catalogPrice ?? details.catalogPrice ?? undefined,
      };
    } catch (error) {
      console.warn(
        `Enrichissement tome ${num ?? "?"} Nautiljon impossible :`,
        resolveErrorMessage(error, "erreur"),
      );
    }
  }

  return { ...payload, volumes: nextVolumes };
}

/**
 * @description Parse un HTML de fiche série Nautiljon (sans fetch tome).
 */
function finalizeNautiljonScrapePayload(
  html: string,
  pageUrl: string,
): ScrapePayloadV1 {
  return parseNautiljonMangaPageHtml(html, pageUrl);
}

/** HTML + URL issus de la navigation WebView guidée. */
export interface NautiljonBrowseFicheResult {
  html: string;
  url: string;
}

/**
 * @description Ouvre Nautiljon dans une WebView : l'utilisateur choisit une fiche
 * puis clique « Importer dans Mangathèque ».
 * @param query - Titre prérempli dans l'URL de recherche.
 * @param kind - Catalogue manga ou anime.
 */
export async function browseNautiljonFiche(
  query: string,
  kind: NautiljonSearchKind,
): Promise<NautiljonBrowseFicheResult> {
  if (!isTauriRuntime()) {
    throw new Error("La navigation Nautiljon nécessite l'application native.");
  }
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Saisissez un titre avant d'ouvrir Nautiljon.");
  }
  try {
    return await invoke<NautiljonBrowseFicheResult>("browse_nautiljon_fiche_html", {
      query: trimmed,
      kind,
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Navigation Nautiljon impossible."),
    );
  }
}

/**
 * @description Navigation Nautiljon guidée → valeurs de formulaire.
 * @param query - Titre de départ.
 * @param kind - Catalogue.
 * @param owners - Propriétaires (appartenances).
 */
export async function importWorkFormFromNautiljonBrowse(
  query: string,
  kind: NautiljonSearchKind,
  owners: Owner[] = [],
): Promise<WorkFormValues> {
  const { html, url } = await browseNautiljonFiche(query, kind);
  const payload = finalizeNautiljonScrapePayload(html, url);
  return scrapePayloadToFormValues(payload, owners);
}

/**
 * @description Navigation Nautiljon guidée → payload scrape (enrichissement sas).
 * @param query - Titre de départ.
 * @param kind - Catalogue.
 */
export async function browseNautiljonScrapePayload(
  query: string,
  kind: NautiljonSearchKind = "manga",
) {
  const { html, url } = await browseNautiljonFiche(query, kind);
  return finalizeNautiljonScrapePayload(html, url);
}

/**
 * @description Fusionne un import Nautiljon dans un formulaire existant.
 * Toutes les métadonnées catalogue Nautiljon (titre, type, genres, thèmes,
 * synopsis, cover, éditeur, compteurs, suivi) priment sur Mihon / local.
 * Les IDs Mihon catalogue et trackers locaux sont conservés.
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
  const importedDefinesTracking =
    imported.hasVolumeTracking || imported.hasChapterTracking;
  const hasVolumeTracking = importedDefinesTracking
    ? imported.hasVolumeTracking
    : current.hasVolumeTracking;
  const hasChapterTracking = importedDefinesTracking
    ? imported.hasChapterTracking
    : current.hasChapterTracking;
  const importedCover = imported.coverUrl.trim();
  const importedTitle = imported.title.trim();

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
    // Titre Nautiljon prioritaire dès qu'il est présent.
    title: importedTitle || current.title,
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
    coverUrl: importedCover || current.coverUrl,
    sourceUrl: imported.sourceUrl.trim() || current.sourceUrl,
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
    // Conservés depuis la fiche locale (Mihon / trackers).
    mihonSourceId: current.mihonSourceId,
    mihonSourceName: current.mihonSourceName,
    mihonCatalogUrl: current.mihonCatalogUrl,
    malId: current.malId ?? imported.malId,
    anilistId: current.anilistId ?? imported.anilistId,
    enrichmentStatus: current.enrichmentStatus,
  };
}
