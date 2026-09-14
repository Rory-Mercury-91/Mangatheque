import { invoke } from "@tauri-apps/api/core";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { isDesktopRuntime } from "@/lib/platform";
import { closeNautiljonBrowseWindow } from "@/services/platform/linkService";
import type { Work } from "@/types/database";
import { resolveErrorMessage } from "@/utils/errorMessage";
import { persistCoverImageUrl } from "@/utils/coverUrl";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import {
  extractNautiljonSlug,
  normalizeNautiljonSlug,
  parseNautiljonPlanningHtml,
  type PlanningVolumeEntry,
} from "@/utils/nautiljonPlanningParser";

export interface PlanningSyncStats {
  scanned: number;
  matched: number;
  created: number;
  updated: number;
  skipped: number;
}

type WorkSyncRow = Pick<
  Work,
  "id" | "title" | "source_url" | "default_price" | "price_format" | "volumes_vf_count"
>;

interface VolumeSyncRow {
  id: string;
  work_id: string;
  volume_number: number;
  release_date: string | null;
  cover_url: string | null;
  price_manual_override: boolean;
}

const VOLUME_QUERY_CHUNK = 80;
const WRITE_CHUNK = 40;

/**
 * @description Clé de lookup tome (normalise le NUMERIC PostgREST « 7 » / « 7.00 »).
 */
function volumeLookupKey(workId: string, volumeNumber: number | string): string {
  const normalized = Number(volumeNumber);
  const value = Number.isFinite(normalized)
    ? Math.round(normalized * 100) / 100
    : volumeNumber;
  return `${workId}|${value}`;
}

/**
 * @description Télécharge le HTML planning via WebView Rust (desktop uniquement).
 */
async function fetchNautiljonPlanningHtml(): Promise<string> {
  if (!isDesktopRuntime()) {
    throw new Error(
      "La synchronisation planning Nautiljon est réservée à l'application bureau.",
    );
  }

  try {
    return await invoke<string>("fetch_nautiljon_planning_html");
  } catch (error) {
    throw new Error(
      resolveErrorMessage(
        error,
        "Impossible de télécharger le planning Nautiljon.",
      ),
    );
  } finally {
    // Ceinture : ferme toute WebView de scrape restée ouverte.
    await closeNautiljonBrowseWindow();
  }
}

/**
 * @description Indexe les séries pour un match slug / titre en O(1).
 */
function buildWorkIndexes(works: WorkSyncRow[]): {
  bySlug: Map<string, WorkSyncRow>;
  byTitle: Map<string, WorkSyncRow>;
} {
  const bySlug = new Map<string, WorkSyncRow>();
  const byTitle = new Map<string, WorkSyncRow>();
  for (const work of works) {
    const slug = extractNautiljonSlug(work.source_url);
    if (slug && !bySlug.has(slug)) {
      bySlug.set(slug, work);
    }
    const titleKey = normalizeTitleForComparison(work.title);
    if (titleKey && !byTitle.has(titleKey)) {
      byTitle.set(titleKey, work);
    }
  }
  return { bySlug, byTitle };
}

function findMatchingWork(
  bySlug: Map<string, WorkSyncRow>,
  byTitle: Map<string, WorkSyncRow>,
  entry: PlanningVolumeEntry,
): WorkSyncRow | null {
  const entrySlugNorm = normalizeNautiljonSlug(entry.seriesSlug);
  const bySlugHit = bySlug.get(entrySlugNorm);
  if (bySlugHit) return bySlugHit;
  return byTitle.get(normalizeTitleForComparison(entry.seriesTitle)) ?? null;
}

/**
 * @description Charge les tomes classic des séries concernées (par lots).
 */
async function fetchVolumesForWorks(
  workIds: string[],
): Promise<Map<string, VolumeSyncRow>> {
  const supabase = getSupabaseClient();
  const byKey = new Map<string, VolumeSyncRow>();
  if (workIds.length === 0) return byKey;

  for (let i = 0; i < workIds.length; i += VOLUME_QUERY_CHUNK) {
    const chunk = workIds.slice(i, i + VOLUME_QUERY_CHUNK);
    const { data, error } = await supabase
      .from("volumes")
      .select(
        "id, work_id, volume_number, release_date, cover_url, price_manual_override",
      )
      .in("work_id", chunk)
      .eq("edition_type", "classic");
    if (error) {
      throw new Error(`Chargement tomes planning : ${error.message}`);
    }
    for (const row of (data ?? []) as VolumeSyncRow[]) {
      const volumeNumber = Number(row.volume_number);
      if (!Number.isFinite(volumeNumber)) continue;
      byKey.set(volumeLookupKey(row.work_id, volumeNumber), {
        ...row,
        volume_number: Math.round(volumeNumber * 100) / 100,
      });
    }
  }
  return byKey;
}

/**
 * @description Exécute des écritures par lots (concurrence limitée).
 */
async function runInChunks<T>(
  items: T[],
  chunkSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map((item) => worker(item)));
  }
}

function buildWorkPatch(
  work: WorkSyncRow,
  entry: PlanningVolumeEntry,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  if (!work.source_url?.trim()) {
    patch.source_url = `https://www.nautiljon.com/mangas/${entry.seriesSlug}/`;
  }
  const currentMax = work.volumes_vf_count ?? 0;
  if (entry.volumeNumber > currentMax) {
    patch.volumes_vf_count = entry.volumeNumber;
  }
  if (
    work.price_format === "broche" &&
    entry.priceEur != null &&
    Number(work.default_price) !== entry.priceEur
  ) {
    patch.default_price = entry.priceEur;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function applyWorkPatchLocally(
  work: WorkSyncRow,
  patch: Record<string, unknown>,
): void {
  if (typeof patch.source_url === "string") {
    work.source_url = patch.source_url;
  }
  if (typeof patch.volumes_vf_count === "number") {
    work.volumes_vf_count = patch.volumes_vf_count;
  }
  if (typeof patch.default_price === "number") {
    work.default_price = patch.default_price;
  }
}

/**
 * @description Synchronise le planning Nautiljon vers Supabase.
 * @param options.html - HTML fourni manuellement (fichier sauvé depuis le navigateur).
 *   Si absent, télécharge via WebView Tauri (desktop).
 */
export async function runPlanningSync(options?: {
  html?: string;
}): Promise<PlanningSyncStats> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Session Supabase : ${sessionError.message}`);
  }
  if (!sessionData.session) {
    throw new Error("Session expirée — reconnectez-vous.");
  }

  const manualHtml = options?.html?.trim() ?? "";
  const html = manualHtml || (await fetchNautiljonPlanningHtml());
  const planningEntries = parseNautiljonPlanningHtml(html);

  if (planningEntries.length === 0) {
    throw new Error(
      "Planning Nautiljon illisible (page vide ou accès bloqué).",
    );
  }

  const { data: works, error: worksError } = await supabase
    .from("works")
    .select("id, title, source_url, default_price, price_format, volumes_vf_count");

  if (worksError) {
    throw new Error(`Chargement séries : ${worksError.message}`);
  }

  const workList = (works ?? []) as WorkSyncRow[];
  const { bySlug, byTitle } = buildWorkIndexes(workList);

  const stats: PlanningSyncStats = {
    scanned: planningEntries.length,
    matched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  const matchedPairs: Array<{ work: WorkSyncRow; entry: PlanningVolumeEntry }> =
    [];
  for (const entry of planningEntries) {
    const work = findMatchingWork(bySlug, byTitle, entry);
    if (!work) {
      stats.skipped += 1;
      continue;
    }
    stats.matched += 1;
    matchedPairs.push({ work, entry });
  }

  const workIds = [...new Set(matchedPairs.map((pair) => pair.work.id))];
  const volumesByKey = await fetchVolumesForWorks(workIds);

  /** Plus haut n° de tome classic déjà présent, par série. */
  const maxVolumeByWorkId = new Map<string, number>();
  for (const row of volumesByKey.values()) {
    const prev = maxVolumeByWorkId.get(row.work_id) ?? 0;
    if (row.volume_number > prev) {
      maxVolumeByWorkId.set(row.work_id, row.volume_number);
    }
  }

  type VolumeInsert = {
    work_id: string;
    volume_number: number;
    cover_url: string | null;
    release_date: string | null;
    edition_type: "classic";
  };
  type VolumeUpdate = { id: string; patch: Record<string, unknown> };
  type WorkUpdate = { id: string; patch: Record<string, unknown> };
  type ActivityInsert = {
    action_type: "planning_volume_create" | "planning_volume_update";
    entity_type: "work";
    entity_id: string;
    entity_title: string;
    metadata: Record<string, unknown>;
    user_id: null;
    user_email: null;
  };

  const volumeInserts: VolumeInsert[] = [];
  const volumeUpdates: VolumeUpdate[] = [];
  const workUpdates = new Map<string, WorkUpdate>();
  const activityLogs: ActivityInsert[] = [];
  /** Inserts déjà planifiés dans ce run (évite classic + collector = même n°). */
  const pendingInsertKeys = new Set<string>();

  for (const { work, entry } of matchedPairs) {
    const key = volumeLookupKey(work.id, entry.volumeNumber);
    const existing = volumesByKey.get(key) ?? null;

    if (!existing) {
      // Doublon planning (collector vs classique, ou HTML en double) : enrichir l'insert.
      if (pendingInsertKeys.has(key)) {
        const pending = volumeInserts.find(
          (row) => volumeLookupKey(row.work_id, row.volume_number) === key,
        );
        if (pending) {
          const cover = persistCoverImageUrl(entry.coverUrl);
          if (cover && !pending.cover_url) {
            pending.cover_url = cover;
          }
          if (entry.releaseDate && !pending.release_date) {
            pending.release_date = entry.releaseDate;
          }
        }
        stats.skipped += 1;
        continue;
      }

      const maxExisting = maxVolumeByWorkId.get(work.id) ?? 0;
      // Pas de création sur une série sans tome : évite d'importer des sorties
      // pour des fiches vides / non commencées.
      if (maxExisting <= 0) {
        stats.skipped += 1;
        continue;
      }
      // Uniquement le prochain tome (ou intercalaire juste après le max).
      if (entry.volumeNumber > maxExisting + 1) {
        stats.skipped += 1;
        continue;
      }

      volumeInserts.push({
        work_id: work.id,
        volume_number: entry.volumeNumber,
        cover_url: persistCoverImageUrl(entry.coverUrl),
        release_date: entry.releaseDate,
        edition_type: "classic",
      });
      pendingInsertKeys.add(key);
      maxVolumeByWorkId.set(work.id, Math.max(maxExisting, entry.volumeNumber));
      const workPatch = buildWorkPatch(work, entry);
      if (workPatch) {
        applyWorkPatchLocally(work, workPatch);
        const prev = workUpdates.get(work.id);
        workUpdates.set(work.id, {
          id: work.id,
          patch: { ...(prev?.patch ?? {}), ...workPatch },
        });
      }
      activityLogs.push({
        action_type: "planning_volume_create",
        entity_type: "work",
        entity_id: work.id,
        entity_title: `${work.title} — Tome ${entry.volumeNumber}`,
        metadata: {
          source: "nautiljon_planning",
          workId: work.id,
          volumeNumber: entry.volumeNumber,
          releaseDate: entry.releaseDate,
          coverUrl: entry.coverUrl,
          priceEur: entry.priceEur,
          changes: ["volume", "release_date", "cover_url"],
          volumePageUrl: entry.volumePageUrl,
        },
        user_id: null,
        user_email: null,
      });
      stats.created += 1;
      continue;
    }

    const volumePatch: Record<string, unknown> = {};
    const changes: string[] = [];

    if (entry.releaseDate && entry.releaseDate !== existing.release_date) {
      volumePatch.release_date = entry.releaseDate;
      changes.push("release_date");
    }
    const normalizedCoverUrl = persistCoverImageUrl(entry.coverUrl);
    if (
      normalizedCoverUrl &&
      persistCoverImageUrl(existing.cover_url) !== normalizedCoverUrl
    ) {
      volumePatch.cover_url = normalizedCoverUrl;
      changes.push("cover_url");
    }

    const workPatch = buildWorkPatch(work, entry);
    if (workPatch) {
      applyWorkPatchLocally(work, workPatch);
      const prev = workUpdates.get(work.id);
      workUpdates.set(work.id, {
        id: work.id,
        patch: { ...(prev?.patch ?? {}), ...workPatch },
      });
    }

    if (Object.keys(volumePatch).length > 0) {
      volumeUpdates.push({ id: existing.id, patch: volumePatch });
      // Garde la map locale cohérente pour d'éventuels doublons planning.
      volumesByKey.set(key, {
        ...existing,
        release_date:
          typeof volumePatch.release_date === "string"
            ? volumePatch.release_date
            : existing.release_date,
        cover_url:
          typeof volumePatch.cover_url === "string"
            ? volumePatch.cover_url
            : existing.cover_url,
      });
    }

    if (changes.length === 0 && !workPatch) {
      stats.skipped += 1;
      continue;
    }

    activityLogs.push({
      action_type: "planning_volume_update",
      entity_type: "work",
      entity_id: work.id,
      entity_title: `${work.title} — Tome ${entry.volumeNumber}`,
      metadata: {
        source: "nautiljon_planning",
        workId: work.id,
        volumeNumber: entry.volumeNumber,
        releaseDate: entry.releaseDate,
        coverUrl: entry.coverUrl,
        priceEur: entry.priceEur,
        changes: changes.length > 0 ? changes : ["work"],
        volumePageUrl: entry.volumePageUrl,
      },
      user_id: null,
      user_email: null,
    });
    stats.updated += 1;
  }

  for (let i = 0; i < volumeInserts.length; i += WRITE_CHUNK) {
    const chunk = volumeInserts.slice(i, i + WRITE_CHUNK);
    const { error } = await supabase.from("volumes").insert(chunk);
    if (error) {
      throw new Error(`Création tomes planning : ${error.message}`);
    }
  }

  await runInChunks(volumeUpdates, WRITE_CHUNK, async ({ id, patch }) => {
    const { error } = await supabase.from("volumes").update(patch).eq("id", id);
    if (error) {
      throw new Error(`Mise à jour tome planning : ${error.message}`);
    }
  });

  await runInChunks(
    Array.from(workUpdates.values()),
    WRITE_CHUNK,
    async ({ id, patch }) => {
      const { error } = await supabase.from("works").update(patch).eq("id", id);
      if (error) {
        throw new Error(`Mise à jour série planning : ${error.message}`);
      }
    },
  );

  for (let i = 0; i < activityLogs.length; i += WRITE_CHUNK) {
    const chunk = activityLogs.slice(i, i + WRITE_CHUNK);
    const { error } = await supabase.from("activity_logs").insert(chunk);
    if (error) {
      console.error("Journal planning :", error.message);
    }
  }

  return stats;
}
