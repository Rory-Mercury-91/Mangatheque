import { getSupabaseClient } from "@/lib/supabaseClient";

/** Source Mihon rattachée à une œuvre. */
export interface WorkMihonSource {
  id: string;
  workId: string;
  sourceId: string;
  sourceName: string | null;
  catalogUrl: string | null;
  createdAt: string;
}

/** Données pour rattacher / upsert une source Mihon. */
export interface WorkMihonSourceInput {
  sourceId: string;
  sourceName?: string | null;
  catalogUrl?: string | null;
}

/**
 * @description Mappe une ligne Supabase vers le type applicatif.
 */
function mapRow(row: {
  id: string;
  work_id: string;
  source_id: string;
  source_name: string | null;
  catalog_url: string | null;
  created_at: string;
}): WorkMihonSource {
  return {
    id: row.id,
    workId: row.work_id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    catalogUrl: row.catalog_url,
    createdAt: row.created_at,
  };
}

/**
 * @description Liste les sources Mihon d'une œuvre.
 * @param workId - Identifiant de l'œuvre.
 */
export async function fetchWorkMihonSources(
  workId: string,
): Promise<WorkMihonSource[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_mihon_sources")
    .select("id, work_id, source_id, source_name, catalog_url, created_at")
    .eq("work_id", workId)
    .order("source_name", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(
      `Impossible de charger les sources Mihon : ${error.message}`,
    );
  }

  return (data ?? []).map(mapRow);
}

/** Taille max d'un `.in()` PostgREST (évite 400 Bad Request sur URL trop longue). */
const WORK_ID_IN_CHUNK = 80;

/**
 * @description Indique si l'erreur vient d'une table absente / non exposée.
 */
function isMissingMihonSourcesTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("work_mihon_sources") ||
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table")
  );
}

/**
 * @description Charge les sources Mihon pour plusieurs œuvres (requêtes par lots).
 * @param workIds - Identifiants d'œuvres.
 */
export async function fetchWorkMihonSourcesByWorkIds(
  workIds: string[],
): Promise<Map<string, WorkMihonSource[]>> {
  const result = new Map<string, WorkMihonSource[]>();
  if (workIds.length === 0) {
    return result;
  }

  const supabase = getSupabaseClient();

  for (let offset = 0; offset < workIds.length; offset += WORK_ID_IN_CHUNK) {
    const chunk = workIds.slice(offset, offset + WORK_ID_IN_CHUNK);
    const { data, error } = await supabase
      .from("work_mihon_sources")
      .select("id, work_id, source_id, source_name, catalog_url, created_at")
      .in("work_id", chunk)
      .order("source_name", { ascending: true, nullsFirst: false });

    if (error) {
      // Table pas encore migrée : on laisse l'UI se rabattre sur works.mihon_*.
      if (isMissingMihonSourcesTableError(error.message)) {
        console.warn(
          "Table work_mihon_sources indisponible — fallback colonnes works.mihon_* :",
          error.message,
        );
        return result;
      }
      throw new Error(
        `Impossible de charger les sources Mihon : ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      const mapped = mapRow(row);
      const list = result.get(mapped.workId) ?? [];
      list.push(mapped);
      result.set(mapped.workId, list);
    }
  }

  return result;
}

/**
 * @description Indique si une source Mihon est déjà rattachée à l'œuvre.
 */
export async function hasWorkMihonSource(
  workId: string,
  sourceId: string,
): Promise<boolean> {
  const trimmed = sourceId.trim();
  if (!trimmed) return false;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_mihon_sources")
    .select("id")
    .eq("work_id", workId)
    .eq("source_id", trimmed)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de vérifier la source Mihon : ${error.message}`,
    );
  }
  return Boolean(data);
}

/**
 * @description Synchronise les colonnes dénormalisées works.mihon_* depuis la 1ʳᵉ source.
 */
async function syncPrimaryMihonFields(workId: string): Promise<void> {
  const sources = await fetchWorkMihonSources(workId);
  const primary = sources[0] ?? null;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("works")
    .update({
      mihon_source_id: primary?.sourceId ?? null,
      mihon_source_name: primary?.sourceName ?? null,
      mihon_catalog_url: primary?.catalogUrl ?? null,
    })
    .eq("id", workId);

  if (error) {
    throw new Error(
      `Impossible de synchroniser les champs Mihon : ${error.message}`,
    );
  }
}

export type AttachWorkMihonSourceResult =
  | { status: "attached" }
  | { status: "already_present" }
  | { status: "skipped"; reason: string };

/**
 * @description Rattache une source Mihon à une œuvre (idempotent).
 * @param workId - Œuvre cible (sas ou bibliothèque).
 * @param input - Source à rattacher.
 */
export async function attachWorkMihonSource(
  workId: string,
  input: WorkMihonSourceInput,
): Promise<AttachWorkMihonSourceResult> {
  const sourceId = input.sourceId.trim();
  if (!sourceId) {
    return { status: "skipped", reason: "source_id manquant" };
  }

  if (await hasWorkMihonSource(workId, sourceId)) {
    return { status: "already_present" };
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("work_mihon_sources").insert({
    work_id: workId,
    source_id: sourceId,
    source_name: input.sourceName?.trim() || null,
    catalog_url: input.catalogUrl?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "already_present" };
    }
    throw new Error(
      `Impossible de rattacher la source Mihon : ${error.message}`,
    );
  }

  await syncPrimaryMihonFields(workId);
  return { status: "attached" };
}

/**
 * @description Map catalogue (sourceId + catalogUrl) → workId.
 */
export async function fetchLocalMihonCatalogWorkMap(): Promise<
  Map<string, string>
> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_mihon_sources")
    .select("work_id, source_id, catalog_url");

  if (error) {
    throw new Error(
      `Impossible de charger l'index catalogue Mihon : ${error.message}`,
    );
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const sourceId = String(row.source_id ?? "").trim();
    const workId = String(row.work_id ?? "").trim();
    if (!sourceId || !workId) continue;
    const catalogUrl = String(row.catalog_url ?? "").trim();
    const key = buildMihonCatalogKey(sourceId, catalogUrl || null);
    if (!map.has(key)) {
      map.set(key, workId);
    }
  }
  return map;
}

/**
 * @description Clé stable source + catalogue pour dédup d'import.
 */
export function buildMihonCatalogKey(
  sourceId: string,
  catalogUrl: string | null,
): string {
  return `${sourceId.trim()}::${(catalogUrl ?? "").trim()}`;
}

/**
 * @description Cherche une œuvre déjà liée à cette source + URL catalogue.
 */
export async function findWorkIdByMihonCatalog(
  sourceId: string,
  catalogUrl: string | null,
): Promise<string | null> {
  const trimmedSource = sourceId.trim();
  if (!trimmedSource) return null;

  const supabase = getSupabaseClient();
  let query = supabase
    .from("work_mihon_sources")
    .select("work_id")
    .eq("source_id", trimmedSource)
    .limit(1);

  const trimmedUrl = catalogUrl?.trim() || null;
  if (trimmedUrl) {
    query = query.eq("catalog_url", trimmedUrl);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(
      `Recherche source Mihon impossible : ${error.message}`,
    );
  }
  return data?.work_id ? String(data.work_id) : null;
}
