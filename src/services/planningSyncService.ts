import { invoke } from "@tauri-apps/api/core";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { isTauriRuntime } from "@/lib/platform";
import type { Work } from "@/types/database";
import { resolveErrorMessage } from "@/utils/errorMessage";
import {
  extractNautiljonSlug,
  normalizeNautiljonSlug,
  normalizeTitleForComparison,
  parseNautiljonPlanningHtml,
  type PlanningVolumeEntry,
} from "@/utils/nautiljonPlanningParser";

const NAUTILJON_PLANNING_URL = "https://www.nautiljon.com/planning/manga/";
const NAUTILJON_HOME_URL = "https://www.nautiljon.com/";

const NAUTILJON_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

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

/**
 * @description Télécharge le HTML planning (WebView desktop, HTTP Rust mobile).
 */
async function fetchNautiljonPlanningHtml(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await invoke<string>("fetch_nautiljon_planning_html");
    } catch (error) {
      throw new Error(
        resolveErrorMessage(
          error,
          "Impossible de télécharger le planning Nautiljon.",
        ),
      );
    }
  }

  return fetchNautiljonPlanningHtmlViaFetch();
}

async function fetchNautiljonPlanningHtmlViaFetch(
  cookieHeader = "",
): Promise<string> {
  if (!cookieHeader) {
    try {
      const homeResponse = await fetch(NAUTILJON_HOME_URL, {
        headers: NAUTILJON_BROWSER_HEADERS,
        redirect: "follow",
      });
      cookieHeader = extractCookieHeader(homeResponse.headers.get("set-cookie"));
    } catch {
      /* warm-up optionnel */
    }
  }

  const response = await fetch(NAUTILJON_PLANNING_URL, {
    headers: {
      ...NAUTILJON_BROWSER_HEADERS,
      Referer: NAUTILJON_HOME_URL,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Nautiljon HTTP ${response.status}`);
  }

  return response.text();
}

function extractCookieHeader(setCookie: string | null): string {
  if (!setCookie) return "";
  const parts = setCookie.split(/,(?=[^;]+?=)/);
  return parts
    .map((chunk) => chunk.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function findMatchingWork(
  works: WorkSyncRow[],
  entry: PlanningVolumeEntry,
): WorkSyncRow | null {
  const entrySlugNorm = normalizeNautiljonSlug(entry.seriesSlug);
  const entryTitleNorm = normalizeTitleForComparison(entry.seriesTitle);

  for (const work of works) {
    const workSlug = extractNautiljonSlug(work.source_url);
    if (workSlug && workSlug === entrySlugNorm) return work;
  }
  for (const work of works) {
    if (normalizeTitleForComparison(work.title) === entryTitleNorm) return work;
  }
  return null;
}

async function updateWorkFromPlanning(
  work: WorkSyncRow,
  entry: PlanningVolumeEntry,
  allowPriceOnly = false,
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const patch: Record<string, unknown> = {};
  let changed = false;

  if (!work.source_url?.trim()) {
    patch.source_url = `https://www.nautiljon.com/mangas/${entry.seriesSlug}/`;
    changed = true;
  }
  const currentMax = work.volumes_vf_count ?? 0;
  if (entry.volumeNumber > currentMax) {
    patch.volumes_vf_count = entry.volumeNumber;
    changed = true;
  }
  if (
    work.price_format === "broche" &&
    entry.priceEur != null &&
    Number(work.default_price) !== entry.priceEur
  ) {
    patch.default_price = entry.priceEur;
    changed = true;
  }

  if (!changed && !allowPriceOnly) return false;
  if (Object.keys(patch).length === 0) return false;

  const { error } = await supabase.from("works").update(patch).eq("id", work.id);
  if (error) {
    throw new Error(`Mise à jour série ${work.title} : ${error.message}`);
  }
  return true;
}

async function logPlanningActivity(input: {
  actionType: "planning_volume_create" | "planning_volume_update";
  work: WorkSyncRow;
  entry: PlanningVolumeEntry;
  changes: string[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("activity_logs").insert({
    action_type: input.actionType,
    entity_type: "work",
    entity_id: input.work.id,
    entity_title: `${input.work.title} — Tome ${input.entry.volumeNumber}`,
    metadata: {
      source: "nautiljon_planning",
      workId: input.work.id,
      volumeNumber: input.entry.volumeNumber,
      releaseDate: input.entry.releaseDate,
      coverUrl: input.entry.coverUrl,
      priceEur: input.entry.priceEur,
      changes: input.changes,
      volumePageUrl: input.entry.volumePageUrl,
    },
    user_id: null,
    user_email: null,
  });
  if (error) {
    console.error("Journal planning :", error.message);
  }
}

async function syncPlanningEntry(
  work: WorkSyncRow,
  entry: PlanningVolumeEntry,
): Promise<"created" | "updated" | "unchanged"> {
  const supabase = getSupabaseClient();
  const { data: existingVolumes, error: volError } = await supabase
    .from("volumes")
    .select(
      "id, work_id, volume_number, release_date, cover_url, price_manual_override",
    )
    .eq("work_id", work.id)
    .eq("volume_number", entry.volumeNumber);

  if (volError) {
    throw new Error(`Tomes ${work.title} : ${volError.message}`);
  }

  const existing = ((existingVolumes ?? [])[0] ?? null) as VolumeSyncRow | null;

  if (!existing) {
    const { error: insertError } = await supabase.from("volumes").insert({
      work_id: work.id,
      volume_number: entry.volumeNumber,
      cover_url: entry.coverUrl,
      release_date: entry.releaseDate,
      edition_type: "classic",
    });
    if (insertError) {
      throw new Error(`Création tome ${entry.volumeNumber} : ${insertError.message}`);
    }
    await updateWorkFromPlanning(work, entry);
    await logPlanningActivity({
      actionType: "planning_volume_create",
      work,
      entry,
      changes: ["volume", "release_date", "cover_url"],
    });
    return "created";
  }

  const volumePatch: Record<string, unknown> = {};
  const changes: string[] = [];

  if (entry.releaseDate && entry.releaseDate !== existing.release_date) {
    volumePatch.release_date = entry.releaseDate;
    changes.push("release_date");
  }
  if (
    entry.coverUrl &&
    (!existing.cover_url || existing.cover_url !== entry.coverUrl)
  ) {
    volumePatch.cover_url = entry.coverUrl;
    changes.push("cover_url");
  }

  const workChanged = await updateWorkFromPlanning(
    work,
    entry,
    changes.length === 0,
  );

  if (Object.keys(volumePatch).length > 0) {
    const { error: updateError } = await supabase
      .from("volumes")
      .update(volumePatch)
      .eq("id", existing.id);
    if (updateError) {
      throw new Error(`Mise à jour tome ${entry.volumeNumber} : ${updateError.message}`);
    }
  }

  if (changes.length === 0 && !workChanged) return "unchanged";

  await logPlanningActivity({
    actionType: "planning_volume_update",
    work,
    entry,
    changes: changes.length > 0 ? changes : ["work"],
  });
  return "updated";
}

/**
 * @description Synchronise le planning Nautiljon vers Supabase (IP locale via Tauri).
 */
export async function runPlanningSync(): Promise<PlanningSyncStats> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Session Supabase : ${sessionError.message}`);
  }
  if (!sessionData.session) {
    throw new Error("Session expirée — reconnectez-vous.");
  }

  const html = await fetchNautiljonPlanningHtml();
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
  const stats: PlanningSyncStats = {
    scanned: planningEntries.length,
    matched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  for (const entry of planningEntries) {
    const work = findMatchingWork(workList, entry);
    if (!work) {
      stats.skipped += 1;
      continue;
    }
    stats.matched += 1;
    const result = await syncPlanningEntry(work, entry);
    if (result === "created") stats.created += 1;
    else if (result === "updated") stats.updated += 1;
    else stats.skipped += 1;
  }

  return stats;
}
