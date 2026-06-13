/**
 * @description Synchronise le planning manga Nautiljon vers Supabase (CI ou local).
 * Usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/sync-nautiljon-planning.mjs
 */
import { createClient } from "@supabase/supabase-js";

const NAUTILJON_PLANNING_URL = "https://www.nautiljon.com/planning/manga/";
const NAUTILJON_HOME_URL = "https://www.nautiljon.com/";
const NAUTILJON_BASE = "https://www.nautiljon.com";

const NAUTILJON_BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

/**
 * @description Récupère le HTML du planning Nautiljon (IP sortante du runner ou poste local).
 * @returns HTML de la page planning.
 */
async function fetchNautiljonPlanningHtml() {
  let cookieHeader = "";

  try {
    const homeResponse = await fetch(NAUTILJON_HOME_URL, {
      headers: NAUTILJON_BROWSER_HEADERS,
      redirect: "follow",
    });
    cookieHeader = extractCookieHeader(homeResponse.headers.get("set-cookie"));
  } catch {
    /* warm-up optionnel */
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

/**
 * @param {string | null} setCookie
 * @returns {string}
 */
function extractCookieHeader(setCookie) {
  if (!setCookie) return "";
  const parts = setCookie.split(/,(?=[^;]+?=)/);
  return parts
    .map((chunk) => chunk.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

/**
 * @param {string} title
 * @returns {string}
 */
function normalizeTitleForComparison(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} slug
 * @returns {string}
 */
function normalizeNautiljonSlug(slug) {
  const decoded = decodeURIComponent(slug.replace(/\+/g, " "));
  return normalizeTitleForComparison(decoded.replace(/-/g, " "));
}

/**
 * @param {string | null} sourceUrl
 * @returns {string | null}
 */
function extractNautiljonSlug(sourceUrl) {
  if (!sourceUrl?.trim()) return null;
  const match = sourceUrl.match(/\/mangas\/([^/?#]+)/i);
  if (!match) return null;
  return normalizeNautiljonSlug(match[1]);
}

/**
 * @param {string} value
 * @returns {string | null}
 */
function parseFrDateToIso(value) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function toAbsoluteNautiljonUrl(value) {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${NAUTILJON_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/**
 * @param {string | null} src
 * @returns {string | null}
 */
function normalizeCoverUrl(src) {
  if (!src?.trim()) return null;
  let url = toAbsoluteNautiljonUrl(src);
  url = url.replace("/imagesmin/", "/images/").replace("/mini/", "/");
  return url;
}

/**
 * @param {string} label
 * @returns {string}
 */
function extractSeriesTitleFromVolumeLabel(label) {
  return label
    .replace(/\s+Vol\.?\s*\d+\s*$/i, "")
    .replace(/\s+\d+\s*$/, "")
    .trim();
}

/**
 * @description Parse le HTML du planning Nautiljon en entrées tomes.
 * @param {string} html
 * @returns {Array<{
 *   nautiljonId: string;
 *   releaseDate: string;
 *   volumeNumber: number;
 *   seriesTitle: string;
 *   seriesSlug: string;
 *   coverUrl: string | null;
 *   priceEur: number | null;
 *   volumePageUrl: string;
 * }>}
 */
function parseNautiljonPlanningHtml(html) {
  /** @type {ReturnType<typeof parseNautiljonPlanningHtml>} */
  const entries = [];
  const rowRegex = /<tr id="tr_col_(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const nautiljonId = rowMatch[1];
    const rowHtml = rowMatch[2];
    const dateMatch = rowHtml.match(/<td>(\d{2}\/\d{2}\/\d{4})<\/td>/i);
    const releaseDate = dateMatch ? parseFrDateToIso(dateMatch[1]) : null;
    if (!releaseDate) continue;

    const linkMatch = rowHtml.match(
      /<a href="(\/mangas\/[^"]+\/volume-\d+,\d+\.html)"[^>]*title="([^"]+)"/i,
    );
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const volumeLabel = linkMatch[2];
    const slugMatch = href.match(/\/mangas\/([^/]+)\/volume-(\d+),/i);
    if (!slugMatch) continue;

    const seriesSlug = slugMatch[1];
    const volumeNumber = Number(slugMatch[2]);
    if (!Number.isFinite(volumeNumber) || volumeNumber <= 0) continue;

    const imgMatch = rowHtml.match(/<img src="([^"]+)"/i);
    const coverUrl = normalizeCoverUrl(imgMatch?.[1] ?? null);
    const priceMatch = rowHtml.match(/(\d+(?:[.,]\d+)?)\s*(?:&nbsp;|\s)*€/i);
    const priceEur = priceMatch
      ? Number(priceMatch[1].replace(",", "."))
      : null;

    entries.push({
      nautiljonId,
      releaseDate,
      volumeNumber,
      seriesTitle: extractSeriesTitleFromVolumeLabel(volumeLabel),
      seriesSlug,
      coverUrl,
      priceEur: Number.isFinite(priceEur) ? priceEur : null,
      volumePageUrl: toAbsoluteNautiljonUrl(href),
    });
  }

  return entries;
}

/**
 * @param {Array<{ id: string; title: string; source_url: string | null }>} works
 * @param {ReturnType<typeof parseNautiljonPlanningHtml>[number]} entry
 */
function findMatchingWork(works, entry) {
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

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} work
 * @param {ReturnType<typeof parseNautiljonPlanningHtml>[number]} entry
 * @param {boolean} [allowPriceOnly=false]
 */
async function updateWorkFromPlanning(supabase, work, entry, allowPriceOnly = false) {
  /** @type {Record<string, unknown>} */
  const patch = {};
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
  if (error) throw new Error(`Mise à jour série ${work.title} : ${error.message}`);
  return true;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} input
 */
async function logPlanningActivity(supabase, input) {
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
  if (error) console.error("Journal planning:", error.message);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} work
 * @param {ReturnType<typeof parseNautiljonPlanningHtml>[number]} entry
 */
async function syncPlanningEntry(supabase, work, entry) {
  const { data: existingVolumes, error: volError } = await supabase
    .from("volumes")
    .select(
      "id, work_id, volume_number, release_date, cover_url, price_manual_override",
    )
    .eq("work_id", work.id)
    .eq("volume_number", entry.volumeNumber);

  if (volError) throw new Error(`Tomes ${work.title} : ${volError.message}`);

  const existing = (existingVolumes ?? [])[0] ?? null;

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
    await updateWorkFromPlanning(supabase, work, entry);
    await logPlanningActivity(supabase, {
      actionType: "planning_volume_create",
      work,
      entry,
      changes: ["volume", "release_date", "cover_url"],
    });
    return "created";
  }

  /** @type {Record<string, unknown>} */
  const volumePatch = {};
  /** @type {string[]} */
  const changes = [];

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
    supabase,
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

  await logPlanningActivity(supabase, {
    actionType: "planning_volume_update",
    work,
    entry,
    changes: changes.length > 0 ? changes : ["work"],
  });
  return "updated";
}

/**
 * @description Lance la synchronisation complète planning → Supabase.
 * @returns {Promise<{ scanned: number; matched: number; created: number; updated: number; skipped: number }>}
 */
async function runPlanningSync() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Variables SUPABASE_URL (ou VITE_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY requises.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const planningEntries = parseNautiljonPlanningHtml(await fetchNautiljonPlanningHtml());

  const { data: works, error: worksError } = await supabase
    .from("works")
    .select("id, title, source_url, default_price, price_format, volumes_vf_count");

  if (worksError) throw new Error(`Chargement séries : ${worksError.message}`);

  const workList = works ?? [];
  const stats = {
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
    const result = await syncPlanningEntry(supabase, work, entry);
    if (result === "created") stats.created += 1;
    else if (result === "updated") stats.updated += 1;
    else stats.skipped += 1;
  }

  return stats;
}

try {
  const stats = await runPlanningSync();
  console.log(
    JSON.stringify({ ok: true, stats, syncedAt: new Date().toISOString() }, null, 2),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Erreur inconnue.";
  console.error("sync-nautiljon-planning:", message);
  process.exit(1);
}
