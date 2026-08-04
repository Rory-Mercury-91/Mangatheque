import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  buildMihonCatalogKey,
  type WorkMihonSource,
} from "@/services/mihon/workMihonSourceService";
import type { Work } from "@/types/database";
import { normalizeTitleForComparison } from "@/utils/textNormalize";

/** Entrée ignorée du sas Mihon (ne pas réinjecter à l'import). */
export interface MihonIgnoredEntry {
  id: string;
  title: string;
  titleNormalized: string;
  malId: number | null;
  anilistId: number | null;
  catalogKeys: string[];
  coverUrl: string | null;
  createdAt: string;
}

/** Index en mémoire pour tester rapidement une entrée de backup. */
export interface MihonIgnoreIndex {
  malIds: Set<number>;
  anilistIds: Set<number>;
  catalogKeys: Set<string>;
  titles: Set<string>;
}

/**
 * @description Mappe une ligne Supabase vers le type applicatif.
 */
function mapRow(row: {
  id: string;
  title: string;
  title_normalized: string;
  mal_id: number | null;
  anilist_id: number | null;
  catalog_keys: string[] | null;
  cover_url: string | null;
  created_at: string;
}): MihonIgnoredEntry {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    titleNormalized: String(row.title_normalized ?? ""),
    malId: row.mal_id == null ? null : Number(row.mal_id),
    anilistId: row.anilist_id == null ? null : Number(row.anilist_id),
    catalogKeys: Array.isArray(row.catalog_keys)
      ? row.catalog_keys.map(String).filter(Boolean)
      : [],
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    createdAt: String(row.created_at),
  };
}

/**
 * @description Construit les clés catalogue d'une fiche sas (multi-sources + legacy).
 * @param work - Fiche pending.
 * @param sources - Sources Mihon rattachées.
 */
export function buildIgnoredCatalogKeys(
  work: Work,
  sources: WorkMihonSource[],
): string[] {
  const keys = new Set<string>();

  for (const source of sources) {
    const key = buildMihonCatalogKey(source.sourceId, source.catalogUrl);
    if (key) keys.add(key);
  }

  if (work.mihon_source_id?.trim()) {
    const key = buildMihonCatalogKey(
      work.mihon_source_id,
      work.mihon_catalog_url ?? null,
    );
    if (key) keys.add(key);
  }

  return [...keys];
}

/**
 * @description Liste toutes les entrées ignorées du sas Mihon.
 */
export async function fetchMihonIgnoredEntries(): Promise<MihonIgnoredEntry[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("mihon_ignored_entries")
    .select(
      "id, title, title_normalized, mal_id, anilist_id, catalog_keys, cover_url, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Impossible de charger les ignorés Mihon : ${error.message}`,
    );
  }

  return (data ?? []).map(mapRow);
}

/**
 * @description Construit un index de correspondance pour l'import backup.
 * @param entries - Entrées ignorées.
 */
export function buildMihonIgnoreIndex(
  entries: MihonIgnoredEntry[],
): MihonIgnoreIndex {
  const malIds = new Set<number>();
  const anilistIds = new Set<number>();
  const catalogKeys = new Set<string>();
  const titles = new Set<string>();

  for (const entry of entries) {
    if (entry.malId != null) malIds.add(entry.malId);
    if (entry.anilistId != null) anilistIds.add(entry.anilistId);
    for (const key of entry.catalogKeys) {
      if (key.trim()) catalogKeys.add(key.trim());
    }
    if (entry.titleNormalized) titles.add(entry.titleNormalized);
  }

  return { malIds, anilistIds, catalogKeys, titles };
}

/**
 * @description Indique si une entrée de backup correspond à une série ignorée.
 * @param index - Index des ignorés.
 * @param params - Empreintes de l'entrée importée.
 */
export function matchesMihonIgnoreIndex(
  index: MihonIgnoreIndex,
  params: {
    malId?: number | null;
    anilistId?: number | null;
    catalogKey?: string | null;
    title?: string | null;
  },
): boolean {
  if (params.malId != null && index.malIds.has(params.malId)) {
    return true;
  }
  if (params.anilistId != null && index.anilistIds.has(params.anilistId)) {
    return true;
  }
  const catalogKey = params.catalogKey?.trim();
  if (catalogKey && index.catalogKeys.has(catalogKey)) {
    return true;
  }
  const titleKey = params.title
    ? normalizeTitleForComparison(params.title)
    : "";
  if (titleKey && index.titles.has(titleKey)) {
    return true;
  }
  return false;
}

/**
 * @description Enregistre une fiche sas comme ignorée (bloquée à l'import).
 * @param work - Fiche pending à ignorer.
 * @param sources - Sources Mihon de la fiche.
 * @returns L'entrée ignorée créée.
 */
export async function ignoreMihonWork(
  work: Work,
  sources: WorkMihonSource[],
): Promise<MihonIgnoredEntry> {
  const title = work.title.trim() || "Sans titre";
  const titleNormalized = normalizeTitleForComparison(title);
  if (!titleNormalized) {
    throw new Error("Titre manquant pour ignorer cette fiche.");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("mihon_ignored_entries")
    .insert({
      title,
      title_normalized: titleNormalized,
      mal_id: work.mal_id,
      anilist_id: work.anilist_id,
      catalog_keys: buildIgnoredCatalogKeys(work, sources),
      cover_url: work.cover_url,
    })
    .select(
      "id, title, title_normalized, mal_id, anilist_id, catalog_keys, cover_url, created_at",
    )
    .single();

  if (error) {
    throw new Error(`Impossible d'ignorer la fiche Mihon : ${error.message}`);
  }

  return mapRow(data);
}

/**
 * @description Retire une entrée de la liste des ignorés (réimportable).
 * @param ignoredId - Identifiant de l'entrée ignorée.
 */
export async function unignoreMihonEntry(ignoredId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("mihon_ignored_entries")
    .delete()
    .eq("id", ignoredId);

  if (error) {
    throw new Error(
      `Impossible de restaurer l'entrée ignorée : ${error.message}`,
    );
  }
}
