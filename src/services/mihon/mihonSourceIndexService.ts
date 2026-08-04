import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  LOCAL_CACHE_KEYS,
  readLocalCache,
  writeLocalCache,
} from "@/services/localDataCache";
import { fetchAllPages } from "@/services/supabaseBatchQuery";

/** Catalogue Keiyoushi actuel (format Mihon 0.20+ / `index.json`). */
export const MIHON_KEIYOUSHI_INDEX_URL =
  "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json";

/** Miroir CDN (rate-limit GitHub raw). */
export const MIHON_KEIYOUSHI_INDEX_CDN_URL =
  "https://cdn.jsdelivr.net/gh/keiyoushi/extensions@repo/index.json";

/** Ancien `index.min.json` — désormais un stub « Outdated App » (ne plus utiliser). */
export const MIHON_KEIYOUSHI_INDEX_LEGACY_MIN_URL =
  "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json";

type MihonCatalogSource = {
  name?: string;
  lang?: string;
  language?: string;
  id?: string | number;
  baseUrl?: string;
  homeUrl?: string;
};

type MihonCatalogExtension = {
  name?: string;
  pkg?: string;
  packageName?: string;
  apk?: string;
  version?: string;
  versionName?: string;
  nsfw?: number | boolean;
  contentWarning?: string;
  resources?: {
    apkUrl?: string;
  };
  sources?: MihonCatalogSource[];
};

type MihonSourceUpsertRow = {
  source_id: string;
  source_name: string;
  source_lang: string;
  source_base_url: string | null;
  extension_name: string;
  extension_pkg: string;
  extension_version: string | null;
  extension_apk: string | null;
  extension_nsfw: boolean;
};

export interface MihonSourceInfo {
  sourceId: string;
  sourceName: string;
  sourceLang: string;
  sourceBaseUrl: string | null;
}

/** Snapshot IndexedDB de l'index Mihon (invalidé via lastFetchedAt). */
interface MihonSourceMapCachePayload {
  lastFetchedAt: string | null;
  sources: Array<[string, MihonSourceInfo]>;
  savedAt: number;
}

/** Cache mémoire session (partagé Library / fiche / sas / import). */
let mihonSourceMapMemory: {
  lastFetchedAt: string | null;
  map: Map<string, MihonSourceInfo>;
} | null = null;

/**
 * @description Construit l'URL catalogue complète (base source + chemin Mihon).
 */
export function buildMihonCatalogUrl(
  baseUrl: string | null | undefined,
  path: string | null | undefined,
): string | null {
  const rawPath = String(path ?? "").trim();
  if (!rawPath) return null;
  if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
    return rawPath;
  }
  const base = String(baseUrl ?? "").trim();
  if (!base) return null;
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return `${normalizedBase}${normalizedPath}`;
}

function toBooleanNsfw(
  value: number | boolean | string | undefined,
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return /nsfw|CONTENT_WARNING_NSFW/i.test(value);
  }
  return Number(value ?? 0) === 1;
}

/**
 * @description Extrait la liste d'extensions (ancien tableau ou nouveau `extensionList`).
 */
function extractCatalogExtensions(payload: unknown): MihonCatalogExtension[] {
  if (Array.isArray(payload)) {
    return payload as MihonCatalogExtension[];
  }
  if (payload && typeof payload === "object") {
    const root = payload as {
      extensionList?: { extensions?: MihonCatalogExtension[] };
      extensions?: MihonCatalogExtension[];
    };
    if (Array.isArray(root.extensionList?.extensions)) {
      return root.extensionList.extensions;
    }
    if (Array.isArray(root.extensions)) {
      return root.extensions;
    }
  }
  return [];
}

/**
 * @description True si le payload est le stub « Outdated App » (ancien index.min.json).
 */
function isStubKeiyoushiCatalog(extensions: MihonCatalogExtension[]): boolean {
  if (extensions.length === 0) return true;
  if (extensions.length > 8) return false;
  return extensions.every((extension) => {
    const name = String(extension.name ?? "").toLowerCase();
    const pkg = String(
      extension.pkg ?? extension.packageName ?? "",
    ).toLowerCase();
    return (
      name.includes("outdated") ||
      name.includes("update to mihon") ||
      pkg.includes("extension.all.keiyoushi") ||
      pkg.includes("extension.all.mihon")
    );
  });
}

/**
 * @description Aplatit le catalogue Keiyoushi (ancien + nouveau format) en lignes upsert.
 */
function flattenMihonCatalog(
  extensions: MihonCatalogExtension[],
): MihonSourceUpsertRow[] {
  const rows: MihonSourceUpsertRow[] = [];
  for (const extension of extensions) {
    const extensionSources = Array.isArray(extension.sources)
      ? extension.sources
      : [];
    const apk =
      extension.resources?.apkUrl?.trim() ||
      (extension.apk ? String(extension.apk) : null);
    const version =
      extension.versionName?.trim() ||
      (extension.version ? String(extension.version) : null);
    const pkg =
      extension.packageName?.trim() ||
      extension.pkg?.trim() ||
      "unknown.pkg";

    for (const source of extensionSources) {
      const sourceId = String(source.id ?? "").trim();
      if (!sourceId) continue;
      const baseUrl =
        source.homeUrl?.trim() ||
        source.baseUrl?.trim() ||
        null;
      rows.push({
        source_id: sourceId,
        source_name: String(source.name ?? "Source inconnue"),
        source_lang: String(source.language ?? source.lang ?? "all"),
        source_base_url: baseUrl,
        extension_name: String(extension.name ?? "Extension inconnue"),
        extension_pkg: pkg,
        extension_version: version,
        extension_apk: apk,
        extension_nsfw: toBooleanNsfw(
          extension.contentWarning ?? extension.nsfw,
        ),
      });
    }
  }
  return rows;
}

/**
 * @description Télécharge et parse une URL d'index Keiyoushi.
 */
async function fetchKeiyoushiCatalogRows(
  catalogUrl: string,
): Promise<{ rows: MihonSourceUpsertRow[]; url: string }> {
  const response = await fetch(catalogUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(
      `Téléchargement index Mihon impossible (${response.status}).`,
    );
  }

  const payload = (await response.json()) as unknown;
  const extensions = extractCatalogExtensions(payload);
  if (extensions.length === 0) {
    throw new Error("Format index Mihon invalide : aucune extension.");
  }
  if (isStubKeiyoushiCatalog(extensions)) {
    throw new Error(
      "Index Keiyoushi stub détecté (Outdated App) — bascule vers index.json.",
    );
  }

  const rows = flattenMihonCatalog(extensions);
  if (rows.length < 50) {
    throw new Error(
      `Index Mihon trop petit (${rows.length} sources) — catalogue suspect.`,
    );
  }

  return { rows, url: catalogUrl };
}

/**
 * @description Télécharge l'index Keiyoushi et l'upsert en BDD.
 * Utilise `index.json` (nouveau format) ; refuse l'ancien stub `index.min.json`.
 * @param catalogUrl - URL du catalogue (défaut Keiyoushi index.json).
 */
export async function refreshMihonSourceIndex(
  catalogUrl: string = MIHON_KEIYOUSHI_INDEX_URL,
): Promise<{ imported: number }> {
  const candidates = [
    catalogUrl,
    ...(catalogUrl === MIHON_KEIYOUSHI_INDEX_URL
      ? [MIHON_KEIYOUSHI_INDEX_CDN_URL]
      : []),
    // Si un appelant passe encore l'ancien .min, forcer le bon fichier.
    ...(catalogUrl.includes("index.min.json")
      ? [MIHON_KEIYOUSHI_INDEX_URL, MIHON_KEIYOUSHI_INDEX_CDN_URL]
      : []),
  ];

  let lastError: unknown;
  let importedRows: MihonSourceUpsertRow[] | null = null;
  let usedUrl = catalogUrl;

  for (const url of candidates) {
    try {
      const result = await fetchKeiyoushiCatalogRows(url);
      importedRows = result.rows;
      usedUrl = result.url;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`Index Mihon « ${url} » refusé :`, err);
    }
  }

  if (!importedRows) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Impossible de télécharger l'index Mihon Keiyoushi.");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("upsert_mihon_sources", {
    p_sources: importedRows,
    p_catalog_url: usedUrl,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Force le prochain fetchMihonSourceMap à recharger (lastFetchedAt a changé).
  mihonSourceMapMemory = null;

  return { imported: Number(data ?? importedRows.length) };
}

/**
 * @description Résout une source Mihon par son ID.
 */
export async function getMihonSourceById(
  sourceId: string,
): Promise<MihonSourceInfo | null> {
  const trimmed = sourceId.trim();
  if (!trimmed) return null;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("mihon_sources")
    .select("source_id, source_name, source_lang, source_base_url")
    .eq("source_id", trimmed)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  return {
    sourceId: String(data.source_id),
    sourceName: String(data.source_name),
    sourceLang: String(data.source_lang),
    sourceBaseUrl: data.source_base_url ? String(data.source_base_url) : null,
  };
}

/**
 * @description Persiste la map sources Mihon (mémoire + IndexedDB).
 */
async function persistMihonSourceMapCache(
  lastFetchedAt: string | null,
  map: Map<string, MihonSourceInfo>,
): Promise<void> {
  mihonSourceMapMemory = { lastFetchedAt, map };
  await writeLocalCache(LOCAL_CACHE_KEYS.mihonSourceMap, {
    lastFetchedAt,
    sources: [...map.entries()],
    savedAt: Date.now(),
  } satisfies MihonSourceMapCachePayload);
}

/**
 * @description Charge toutes les sources (cache mémoire → IndexedDB → Supabase).
 * Invalidation via `lastFetchedAt` de l'index (léger : count + 1 ligne).
 * Paginé : l'index Keiyoushi dépasse le plafond PostgREST (~1000 lignes).
 */
export async function fetchMihonSourceMap(): Promise<
  Map<string, MihonSourceInfo>
> {
  const stats = await getMihonSourceIndexStats();
  const stamp = stats.lastFetchedAt;

  if (
    mihonSourceMapMemory &&
    mihonSourceMapMemory.lastFetchedAt === stamp &&
    mihonSourceMapMemory.map.size > 0
  ) {
    return mihonSourceMapMemory.map;
  }

  const cached = await readLocalCache<MihonSourceMapCachePayload>(
    LOCAL_CACHE_KEYS.mihonSourceMap,
  );
  if (
    cached &&
    cached.lastFetchedAt === stamp &&
    Array.isArray(cached.sources) &&
    cached.sources.length > 0
  ) {
    const map = new Map<string, MihonSourceInfo>(cached.sources);
    mihonSourceMapMemory = { lastFetchedAt: stamp, map };
    return map;
  }

  const supabase = getSupabaseClient();
  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("mihon_sources")
      .select("source_id, source_name, source_lang, source_base_url")
      .order("source_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }
    return data ?? [];
  });

  const map = new Map<string, MihonSourceInfo>();
  for (const row of rows) {
    map.set(String(row.source_id), {
      sourceId: String(row.source_id),
      sourceName: String(row.source_name),
      sourceLang: String(row.source_lang),
      sourceBaseUrl: row.source_base_url ? String(row.source_base_url) : null,
    });
  }

  await persistMihonSourceMapCache(stamp, map);
  return map;
}

/**
 * @description Statistiques de l'index local.
 */
export async function getMihonSourceIndexStats(): Promise<{
  total: number;
  lastFetchedAt: string | null;
}> {
  const supabase = getSupabaseClient();
  const [{ count, error: countError }, { data, error: fetchError }] =
    await Promise.all([
      supabase
        .from("mihon_sources")
        .select("source_id", { count: "exact", head: true }),
      supabase
        .from("mihon_sources")
        .select("fetched_at")
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (countError) throw new Error(countError.message);
  if (fetchError) throw new Error(fetchError.message);

  return {
    total: count ?? 0,
    lastFetchedAt: data?.fetched_at ? String(data.fetched_at) : null,
  };
}

/**
 * @description Remplit les `source_name` manquants sur work_mihon_sources / works
 * depuis l'index Keiyoushi local (`mihon_sources`).
 * @param sourceMap - Index déjà chargé (évite un 2ᵉ fetch).
 * @returns Nombre de lignes work_mihon_sources mises à jour.
 */
export async function backfillMihonSourceNamesFromIndex(
  sourceMap?: Map<string, MihonSourceInfo>,
): Promise<{ updatedLinks: number; updatedWorks: number }> {
  const map = sourceMap ?? (await fetchMihonSourceMap());
  if (map.size === 0) {
    return { updatedLinks: 0, updatedWorks: 0 };
  }

  const supabase = getSupabaseClient();

  // Liens sans nom (ou nom = ID brut).
  const linkRows = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("work_mihon_sources")
      .select("id, work_id, source_id, source_name")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) {
      throw new Error(
        `Impossible de lire les sources Mihon pour backfill : ${error.message}`,
      );
    }
    return data ?? [];
  });

  let updatedLinks = 0;
  const workIdsToResync = new Set<string>();

  for (const row of linkRows) {
    const sourceId = String(row.source_id ?? "").trim();
    if (!sourceId) continue;
    const resolved = map.get(sourceId)?.sourceName?.trim() || "";
    if (!resolved) continue;

    const current = row.source_name ? String(row.source_name).trim() : "";
    // Remplir null / vide, ou remplacer un libellé qui n'est que l'ID.
    if (current && current !== sourceId) continue;

    const { error } = await supabase
      .from("work_mihon_sources")
      .update({ source_name: resolved })
      .eq("id", row.id);
    if (error) {
      console.warn(
        `Backfill source_name ${sourceId} :`,
        error.message,
      );
      continue;
    }
    updatedLinks += 1;
    const workId = String(row.work_id ?? "").trim();
    if (workId) workIdsToResync.add(workId);
  }

  // Colonnes dénormalisées sur works (mihon_source_name = ID ou null).
  const workRows = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("works")
      .select("id, mihon_source_id, mihon_source_name")
      .not("mihon_source_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) {
      throw new Error(
        `Impossible de lire les œuvres pour backfill Mihon : ${error.message}`,
      );
    }
    return data ?? [];
  });

  let updatedWorks = 0;
  for (const row of workRows) {
    const sourceId = row.mihon_source_id
      ? String(row.mihon_source_id).trim()
      : "";
    if (!sourceId) continue;
    const resolved = map.get(sourceId)?.sourceName?.trim() || "";
    if (!resolved) continue;
    const current = row.mihon_source_name
      ? String(row.mihon_source_name).trim()
      : "";
    if (current && current !== sourceId) continue;

    const { error } = await supabase
      .from("works")
      .update({ mihon_source_name: resolved })
      .eq("id", row.id);
    if (error) {
      console.warn(
        `Backfill works.mihon_source_name ${sourceId} :`,
        error.message,
      );
      continue;
    }
    updatedWorks += 1;
  }

  return { updatedLinks, updatedWorks };
}
