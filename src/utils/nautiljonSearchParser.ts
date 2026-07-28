import { normalizeTitleForComparison } from "@/utils/textNormalize";

/** Type de catalogue Nautiljon. */
export type NautiljonSearchKind = "manga" | "anime";

/**
 * Résultat d'une fiche trouvée pour Nautiljon.
 */
export interface NautiljonSearchHit {
  kind: NautiljonSearchKind;
  /** Slug URL (ex. `absolute+regression`). */
  slug: string;
  title: string;
  pageUrl: string;
  coverUrl: string | null;
  description: string | null;
  /** Type / démographie (Shonen, Seinen…) ou format animé. */
  metaType: string | null;
  score: string | null;
}

const NAUTILJON_ORIGIN = "https://www.nautiljon.com";

/**
 * @description Construit l'URL de recherche BDD Nautiljon (navigateur).
 * @param query - Titre recherché.
 * @param kind - Catalogue cible.
 */
export function buildNautiljonSearchUrl(
  query: string,
  kind: NautiljonSearchKind,
): string {
  const segment = kind === "anime" ? "animes" : "mangas";
  return `${NAUTILJON_ORIGIN}/${segment}/?q=${encodeURIComponent(query.trim())}&tri=0`;
}

/**
 * @description Construit l'URL DuckDuckGo utilisée par la recherche in-app.
 * @param query - Titre recherché.
 * @param kind - Catalogue cible.
 */
export function buildNautiljonWebSearchUrl(
  query: string,
  kind: NautiljonSearchKind,
): string {
  const segment = kind === "anime" ? "animes" : "mangas";
  const q = `${query.trim()} site:nautiljon.com/${segment}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

/**
 * @description Construit l'URL absolue d'une fiche Nautiljon.
 * @param href - Chemin ou URL complète.
 */
export function absolutizeNautiljonUrl(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${NAUTILJON_ORIGIN}${trimmed}`;
  return `${NAUTILJON_ORIGIN}/${trimmed}`;
}

/**
 * @description Parse le HTML DuckDuckGo (`html.duckduckgo.com`) pour des fiches Nautiljon.
 * Ne conserve que les pages série (`/mangas|animes/{slug}.html`), pas les tomes.
 * @param html - Document HTML brut.
 * @param kind - Catalogue attendu.
 */
export function parseNautiljonSearchHtml(
  html: string,
  kind: NautiljonSearchKind,
): NautiljonSearchHit[] {
  const segment = kind === "anime" ? "animes" : "mangas";
  const hits: NautiljonSearchHit[] = [];
  const seen = new Set<string>();

  const resultRe =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = resultRe.exec(html)) != null) {
    const rawHref = decodeHtml(match[1] ?? "");
    const title = decodeHtml(stripTags(match[2] ?? ""))
      .replace(/\s+/g, " ")
      .trim();
    const target = extractTargetUrlFromDdgHref(rawHref);
    if (!target) continue;

    const fiche = parseNautiljonFicheUrl(target, segment);
    if (!fiche) continue;
    if (seen.has(fiche.slug)) continue;
    if (title.length < 2) continue;

    seen.add(fiche.slug);
    const around = html.slice(
      Math.max(0, match.index),
      Math.min(html.length, match.index + 2200),
    );

    hits.push({
      kind,
      slug: fiche.slug,
      title,
      pageUrl: fiche.pageUrl,
      coverUrl: null,
      description: extractDdgSnippet(around),
      metaType: null,
      score: null,
    });

    if (hits.length >= 25) break;
  }

  // Repli : URLs Nautiljon présentes hors blocs result__a.
  if (hits.length === 0) {
    const looseRe = new RegExp(
      `https?%3A%2F%2F(?:www\\.)?nautiljon\\.com%2F${segment}%2F([^&"'?/]+?)\\.html`,
      "gi",
    );
    let loose: RegExpExecArray | null;
    while ((loose = looseRe.exec(html)) != null) {
      const slugRaw = decodeUriLoose(loose[1] ?? "").trim();
      const slug = slugRaw.replace(/ /g, "+");
      if (!slug || seen.has(slug) || slug.includes("/")) continue;
      seen.add(slug);
      hits.push({
        kind,
        slug,
        title: slug.replace(/\+/g, " "),
        pageUrl: `${NAUTILJON_ORIGIN}/${segment}/${slug}.html`,
        coverUrl: null,
        description: null,
        metaType: null,
        score: null,
      });
      if (hits.length >= 25) break;
    }
  }

  return hits;
}

/**
 * @description Nettoie le titre renvoyé par un moteur (suffixe site, balises…).
 */
export function cleanNautiljonSearchTitle(title: string): string {
  return title
    .replace(/\s*[-–|]\s*Nautiljon\.com\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @description Score de pertinence titre requête ↔ hit (plus haut = mieux).
 */
export function scoreNautiljonSearchHit(
  hit: NautiljonSearchHit,
  query: string,
): number {
  const q = normalizeTitleForComparison(query);
  const t = normalizeTitleForComparison(cleanNautiljonSearchTitle(hit.title));
  const slug = normalizeTitleForComparison(hit.slug.replace(/\+/g, " "));
  if (!q) return 0;
  if (t === q || slug === q) return 100;
  if (t.startsWith(q) || slug.startsWith(q)) return 85;
  if (t.includes(q) || q.includes(t)) {
    const shorter = Math.min(t.length, q.length);
    const longer = Math.max(t.length, q.length);
    return 50 + Math.round((40 * shorter) / longer);
  }
  if (slug.includes(q) || q.includes(slug)) return 45;
  // Tokens communs
  const qTokens = new Set(q.split(" ").filter((w) => w.length > 2));
  const tTokens = t.split(" ").filter((w) => w.length > 2);
  if (qTokens.size === 0) return 0;
  let common = 0;
  for (const tok of tTokens) {
    if (qTokens.has(tok)) common += 1;
  }
  return Math.round((30 * common) / qTokens.size);
}

/**
 * @description Trie les hits par pertinence et nettoie les titres.
 * @param hits - Résultats bruts.
 * @param query - Requête utilisateur.
 */
export function rankNautiljonSearchHits(
  hits: NautiljonSearchHit[],
  query: string,
): NautiljonSearchHit[] {
  return hits
    .map((hit) => ({
      ...hit,
      title: cleanNautiljonSearchTitle(hit.title) || hit.title,
    }))
    .sort(
      (a, b) =>
        scoreNautiljonSearchHit(b, query) - scoreNautiljonSearchHit(a, query),
    );
}

/**
 * @description Libellé compact pour un hit.
 */
export function formatNautiljonSearchHitLabel(hit: NautiljonSearchHit): string {
  const parts: string[] = [];
  parts.push(hit.kind === "anime" ? "Animé" : "Manga");
  if (hit.metaType) parts.push(hit.metaType);
  if (hit.score) parts.push(hit.score);
  parts.push("via web");
  return parts.join(" · ");
}

/**
 * @description Extrait l'URL finale depuis un lien redirect DuckDuckGo.
 */
function extractTargetUrlFromDdgHref(href: string): string | null {
  const cleaned = href.replace(/&amp;/g, "&");
  const uddg = cleaned.match(/[?&]uddg=([^&]+)/i);
  if (uddg?.[1]) {
    return decodeUriLoose(uddg[1]);
  }
  if (/nautiljon\.com/i.test(cleaned)) {
    return cleaned.startsWith("//") ? `https:${cleaned}` : cleaned;
  }
  return null;
}

/**
 * @description Valide une URL fiche série Nautiljon (pas un tome).
 */
function parseNautiljonFicheUrl(
  url: string,
  segment: "mangas" | "animes",
): { slug: string; pageUrl: string } | null {
  const m = url.match(
    /nautiljon\.com\/(mangas|animes)\/([^/?#]+)\.html(?:$|\?|#)/i,
  );
  if (!m) return null;
  if (m[1]!.toLowerCase() !== segment) return null;
  const slug = decodeUriLoose(m[2] ?? "").trim();
  if (!slug || slug.includes("/")) return null;
  // Tomes : parfois encodés sans slash dans d'autres formats — exclure volume-
  if (/^volume[-_]/i.test(slug) || /\/volume[-_]/i.test(url)) return null;

  return {
    slug,
    pageUrl: `${NAUTILJON_ORIGIN}/${segment}/${slug}.html`,
  };
}

function extractDdgSnippet(chunk: string): string | null {
  const snip = chunk.match(
    /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (!snip?.[1]) return null;
  const text = decodeHtml(stripTags(snip[1]))
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 20 ? text.slice(0, 280) : null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeUriLoose(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}
