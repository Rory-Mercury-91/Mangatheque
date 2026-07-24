/** Correspondance MAL ↔ ADKami issue d'un export XML. */
export interface AdkamiMalMapping {
  malId: number;
  adkamiId: number;
  title: string;
}

/**
 * @description Parse un export XML ADKami (format type MAL + series_adk_id).
 */
export function parseAdkamiMalMappingXml(xml: string): AdkamiMalMapping[] {
  const mappings: AdkamiMalMapping[] = [];
  const animeRegex = /<anime>([\s\S]*?)<\/anime>/gi;
  let match: RegExpExecArray | null;

  while ((match = animeRegex.exec(xml)) !== null) {
    const block = match[1];
    const malId = extractTagNumber(block, "series_animedb_id");
    const adkamiId = extractTagNumber(block, "series_adk_id");
    const title = extractTagCdata(block, "series_title");
    if (malId == null || adkamiId == null) continue;
    mappings.push({
      malId,
      adkamiId,
      title: title ?? "",
    });
  }

  return mappings;
}

function extractTagNumber(block: string, tag: string): number | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  const n = Number(m[1].trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractTagCdata(block: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    "i",
  );
  const m = block.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").trim() || null;
}
