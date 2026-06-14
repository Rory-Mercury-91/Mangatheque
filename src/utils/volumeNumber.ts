/**
 * @description Normalise un fragment de numéro de tome (URL ou texte Nautiljon).
 * @param raw - Ex. « 1.5 », « 1,5 », « 1-5 » (slug intercalaire).
 */
export function normalizeVolumeNumberToken(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") {
    return null;
  }

  let token = String(raw).trim().replace(",", ".");

  if (/^\d+-\d+$/.test(token) && !token.includes(".")) {
    const [whole, fraction] = token.split("-");
    if (fraction.length <= 2) {
      token = `${whole}.${fraction}`;
    }
  } else {
    token = token.replace(/_/g, ".");
  }

  const value = Number(token);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

/**
 * @description Parse un numéro de tome depuis un libellé « Vol. 1.5 ».
 */
export function parseVolumeNumberFromText(text: string): number | null {
  const raw = text.trim();
  const match = raw.match(/(?:^|\s)vol\.?\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) {
    return null;
  }
  return normalizeVolumeNumberToken(match[1]);
}

/**
 * @description Parse un numéro de tome depuis une URL volume Nautiljon.
 */
export function parseVolumeNumberFromHref(href: string): number | null {
  const encoded = href.match(/\/volume-vol\.\+(\d+(?:[.,]\d+)?),/i);
  if (encoded) {
    return normalizeVolumeNumberToken(encoded[1]);
  }

  const standard = href.match(/\/volume-(\d+(?:[._-]\d+)?),/i);
  if (standard) {
    return normalizeVolumeNumberToken(standard[1]);
  }

  return null;
}

/**
 * @description Affiche un numéro de tome (7 vs 1.5).
 */
export function formatVolumeNumberDisplay(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(value);
}

/**
 * @description Parse la saisie utilisateur dans le formulaire tome.
 */
export function parseVolumeNumberInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) {
    return null;
  }
  return normalizeVolumeNumberToken(trimmed);
}
