/**
 * @description Lecture des métadonnées d'une fiche Nautiljon.
 * Couvre l'ancienne liste `fiche-fact`, le bandeau 2026 et la fiche technique.
 */

export type NautiljonMetaChunkOptions = {
  /** « Type » ne matche pas « Type volume ». */
  exactLabel?: boolean;
};

/**
 * @description Valeur HTML d'une ligne `fiche-fact` (sans deux-points).
 * @param html - Document ou fragment.
 * @param label - Libellé attendu (« Nb volumes VF », « Type »…).
 * @param options.exactLabel - « Type » ne matche pas « Type volume ».
 * @returns HTML de la valeur, ou null.
 */
export function extractFicheFactChunk(
  html: string,
  label: string,
  options?: NautiljonMetaChunkOptions,
): string | null {
  const escaped = escapeRegExp(label);
  const labelPattern = options?.exactLabel
    ? `${escaped}(?!\\s*(?:volume|VO|VF)\\b)`
    : escaped;
  const re = new RegExp(
    `class="fiche-fact__label"[^>]*>\\s*${labelPattern}\\s*</span>\\s*<span class="fiche-fact__value"[^>]*>([\\s\\S]*?)</span>\\s*</li>`,
    "i",
  );
  return re.exec(html)?.[1] ?? null;
}

/**
 * @description Premier fragment HTML correspondant à un libellé de fiche.
 * Essaie, dans l'ordre : fiche-fact, tags, type du bandeau, édition VF/VO,
 * fiche technique, ligne de fait, compteur d'édition, puis l'ancien « Label : ».
 * @param html - Document HTML.
 * @param labels - Libellés acceptés, du plus précis au plus large.
 * @param options.exactLabel - Évite les libellés qui continuent par volume, VO ou VF.
 * @returns HTML de la valeur, ou null.
 */
export function findNautiljonMetaChunk(
  html: string,
  labels: string[],
  options?: NautiljonMetaChunkOptions,
): string | null {
  for (const label of labels) {
    const fact = extractFicheFactChunk(html, label, options);
    if (fact?.trim()) return fact;

    if (isTagLabel(label)) {
      const tags = extractFicheTagsChunk(html, label);
      if (tags?.trim()) return tags;
    }

    if (options?.exactLabel && normLabel(label) === "type") {
      const typeChunk = extractBandeauTypeChunk(html);
      if (typeChunk?.trim()) return typeChunk;
    }

    const publication = extractPublicationChunk(html, label);
    if (publication?.trim()) return publication;

    const technique = extractTechniqueDd(html, label);
    if (technique?.trim()) return technique;

    const fait = extractBandeauFaitChunk(html, label);
    if (fait?.trim()) return fait;

    const toggle = extractFrenchToggleChunk(html, label);
    if (toggle?.trim()) return toggle;

    const legacy = extractLegacyColonChunk(html, label, options);
    if (legacy?.trim()) return legacy;
  }
  return null;
}

function extractLegacyColonChunk(
  html: string,
  label: string,
  options?: NautiljonMetaChunkOptions,
): string | null {
  const escaped = escapeRegExp(label);
  const labelPattern = options?.exactLabel
    ? `${escaped}(?!\\s*(?:volume|VO|VF)\\b)`
    : escaped;
  const re = new RegExp(
    `(?:<(?:span|b|strong)[^>]*>\\s*)?${labelPattern}\\s*:\\s*(?:</(?:span|b|strong)>)?([\\s\\S]{0,600}?)(?:</li>|<li\\b|</ul>)`,
    "i",
  );
  return re.exec(html)?.[1] ?? null;
}

function extractTechniqueDd(html: string, label: string): string | null {
  const wanted = new Set(techniqueAliases(label).map(normLabel));
  const re =
    /<div class="[^"]*fiche-technique__ligne[^"]*"[^>]*>\s*<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) != null) {
    const dt = normLabel(decodeHtml(stripTags(match[1] ?? "")));
    if (wanted.has(dt)) return match[2] ?? null;
  }
  return null;
}

function techniqueAliases(label: string): string[] {
  const key = normLabel(label);
  if (key === "nb volumes vf") return [label, "Tomes VF"];
  if (key === "nb volumes vo") return [label, "Tomes VO"];
  if (key === "nb chapitres vf" || key === "nb chapitres") {
    return [label, "Chapitres VF"];
  }
  if (key === "nb chapitres vo") return [label, "Chapitres VO"];
  if (key === "prix") return [label, "Prix"];
  if (key === "webcomic") return [label, "Webcomic"];
  if (key === "prepublication" || key === "prepublie dans") {
    return [label, "Prépublication", "Prépublié dans"];
  }
  return [label];
}

function extractFicheTagsChunk(html: string, label: string): string | null {
  const wanted = tagAliases(label);
  const re =
    /class="[^"]*fiche-tags__lib[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]{0,800}?class="[^"]*fiche-tags__liste[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) != null) {
    const lib = normLabel(decodeHtml(stripTags(match[1] ?? "")));
    if (wanted.has(lib)) return match[2] ?? null;
  }
  return null;
}

function tagAliases(label: string): Set<string> {
  const key = normLabel(label);
  if (key === "genre" || key === "genres") return new Set(["genre", "genres"]);
  if (key === "theme" || key === "themes") return new Set(["theme", "themes"]);
  return new Set([key]);
}

function isTagLabel(label: string): boolean {
  const key = normLabel(label);
  return key === "genre" || key === "genres" || key === "theme" || key === "themes";
}

function extractBandeauTypeChunk(html: string): string | null {
  const block = html.match(
    /class="[^"]*fiche-bandeau__sous-titre[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
  )?.[1];
  if (!block) return null;
  return block.match(/<a\b[^>]*types_include[\s\S]*?<\/a>/i)?.[0] ?? null;
}

type BandeauPublication = {
  kind: "vf" | "vo";
  unit: "volume" | "chapter";
  count: string;
  status: string;
  publisherHtml: string;
};

function listBandeauPublications(html: string): BandeauPublication[] {
  const marker = 'class="fiche-bandeau__publication';
  const publications: BandeauPublication[] = [];
  let from = 0;
  while (from < html.length) {
    const at = html.indexOf(marker, from);
    if (at < 0) break;
    const next = html.indexOf(marker, at + marker.length);
    const slice = html.slice(at, next === -1 ? Math.min(html.length, at + 4000) : next);
    from = at + marker.length;

    const lib = normLabel(
      decodeHtml(
        stripTags(
          slice.match(
            /fiche-bandeau__diffusion-lib[^"']*["'][^>]*>([\s\S]*?)(?=fiche-bandeau__drapeau|fiche-bandeau__nombre|fiche-status|fiche-bandeau__diffusion")/i,
          )?.[1] ?? "",
        ),
      ),
    );
    const kind = /\bvf\b/.test(lib) ? "vf" : /\bvo\b/.test(lib) ? "vo" : null;
    if (!kind) continue;

    const nombre = decodeHtml(
      stripTags(
        slice.match(/fiche-bandeau__nombre[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "",
      ),
    )
      .replace(/\s+/g, " ")
      .trim();
    const count = nombre.match(/(\d+)/)?.[1];
    if (!count) continue;

    const status = decodeHtml(
      stripTags(
        slice.match(/class="[^"]*\bfiche-status\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ??
          "",
      ),
    )
      .replace(/\s+/g, " ")
      .trim();
    const unit = /chapitre/.test(normLabel(nombre)) ? "chapter" : "volume";
    publications.push({
      kind,
      unit,
      count,
      status,
      publisherHtml: publisherAnchor(slice),
    });
  }
  return publications;
}

function publisherAnchor(slice: string): string {
  const withoutImprint = slice.replace(/<span class="infos_small"[\s\S]*$/i, "");
  const name = withoutImprint.match(
    /itemprop="name[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  );
  if (name?.[1]?.trim()) return `<a>${name[1]}</a>`;
  return withoutImprint.match(/<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0] ?? "";
}

function extractPublicationChunk(html: string, label: string): string | null {
  const key = normLabel(label);
  const publications = listBandeauPublications(html);
  const vf = publications.find((item) => item.kind === "vf");
  const vo = publications.find((item) => item.kind === "vo");

  if (key === "editeur vf" || key === "editeurs vf" || key === "editeur") {
    return vf?.publisherHtml || null;
  }
  if (key === "editeur vo" || key === "editeurs vo") {
    return vo?.publisherHtml || null;
  }
  if (key === "nb volumes vf") {
    return countChunk(publications.find((item) => item.kind === "vf" && item.unit === "volume"));
  }
  if (key === "nb volumes vo") {
    return countChunk(publications.find((item) => item.kind === "vo" && item.unit === "volume"));
  }
  if (key === "nb chapitres vf" || key === "nb chapitres") {
    return countChunk(
      publications.find((item) => item.kind === "vf" && item.unit === "chapter"),
    );
  }
  if (key === "nb chapitres vo") {
    return countChunk(
      publications.find((item) => item.kind === "vo" && item.unit === "chapter"),
    );
  }
  return null;
}

function countChunk(publication: BandeauPublication | undefined): string | null {
  if (!publication) return null;
  if (!publication.status) return publication.count;
  return `${publication.count} <span class="fiche-status">${escapeHtml(publication.status)}</span>`;
}

function extractBandeauFaitChunk(html: string, label: string): string | null {
  const wanted = normLabel(label);
  const re =
    /class="[^"]*fiche-bandeau__diffusion-lib[^"]*"[^>]*>([\s\S]*?)<\/span>([\s\S]{0,2000}?)(?=class="[^"]*fiche-bandeau__diffusion-lib|class="[^"]*fiche-bandeau__fait"|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) != null) {
    const lib = normLabel(decodeHtml(stripTags(match[1] ?? "")));
    if (lib === wanted) return match[2] ?? null;
  }
  return null;
}

function extractFrenchToggleChunk(html: string, label: string): string | null {
  const key = normLabel(label);
  const wantChapter = key.includes("chapitre");
  const wantVolume = key.includes("volume") && key.includes("vf");
  if (!wantChapter && !wantVolume) return null;

  const re = /class="edition_toggle"([\s\S]{0,1500}?)<\/span>\s*<\/span>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) != null) {
    const slice = match[1] ?? "";
    if (!/france|flags\/fr\.(?:png|svg)/i.test(slice)) continue;
    const text = decodeHtml(stripTags(slice))
      .replace(/&middot;|&#183;/gi, "·")
      .replace(/\s+/g, " ");
    const found = text.match(
      /(\d+)\s+(tomes?|volumes?|chapitres?)\s*[·•.|-]\s*([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+)?)/i,
    );
    if (!found) continue;
    const isChapter = (found[2] ?? "").toLowerCase().startsWith("chapitre");
    if (wantChapter !== isChapter) continue;
    return `${found[1]} <span class="fiche-status">${escapeHtml(found[3] ?? "")}</span>`;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ");
}
