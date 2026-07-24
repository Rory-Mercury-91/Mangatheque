/** Mentions MAL à retirer avant affichage / traduction. */
const MAL_REWRITE_MARKERS = [
  /\[Written by MAL Rewrite\]/gi,
  /\(Source:\s*MAL Rewrite\)/gi,
];

/**
 * @description Nettoie un synopsis (retire les footers MAL Rewrite, espaces).
 * @param synopsis - Texte brut éventuellement null.
 * @returns Synopsis nettoyé, ou chaîne vide.
 */
export function cleanSynopsisSource(synopsis: string | null | undefined): string {
  if (!synopsis) return "";
  let text = synopsis;
  for (const marker of MAL_REWRITE_MARKERS) {
    text = text.replace(marker, " ");
  }
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * @description Heuristique légère : le texte semble déjà en français.
 * @param text - Synopsis nettoyé.
 */
export function looksLikeFrench(text: string): boolean {
  const sample = text.trim();
  if (!sample) return true;
  if (/[àâäéèêëïîôùûüçœæ]/i.test(sample)) return true;

  const frHits = (
    sample.match(
      /\b(le|la|les|des|une|est|dans|pour|avec|qui|que|sur|par|ses|aux|cette|sont|été|être|après|avant|mais|donc|lorsqu|jusqu)\b/gi,
    ) ?? []
  ).length;
  const enHits = (
    sample.match(
      /\b(the|and|of|to|in|is|that|for|with|on|as|was|are|by|from|his|her|their|when|after|before|but)\b/gi,
    ) ?? []
  ).length;

  if (frHits === 0 && enHits === 0) return false;
  return frHits >= enHits;
}
