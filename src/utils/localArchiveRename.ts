import type { LocalArchiveUnit } from "@/constants/localArchive";

/** Entrée d'un dossier source (fichier ou sous-dossier). */
export interface ArchiveSourceEntry {
  name: string;
  isDir: boolean;
}

/** Proposition de renommage d'un fichier. */
export interface ArchiveFileRename {
  /** Nom d'origine dans le dossier source. */
  fromName: string;
  /** Nouveau nom (ex. Chapitre 049.1.cbz). */
  toName: string;
  /** Libellé du numéro (ex. "49.1", "8"). */
  numberLabel: string;
  /** Clé de tri numérique. */
  sortKey: number;
  /** true si le numéro a été extrait du nom (et conservé). */
  detected: boolean;
}

const ARCHIVE_FILE_RE =
  /\.(cbz|cbr|zip|pdf|epub|rar|7z)$/i;

/**
 * Patterns de numérotation (hors préfixe d'index).
 * Conserve les décimales : 49.1, 3-5 → 3.5…
 */
const NUMBER_PATTERNS: RegExp[] = [
  /(?:^|[^a-z0-9])(?:chapter|chapitre|chap)\.?\s*0*(\d+(?:[.-]\d+)?)/i,
  /(?:^|[^a-z0-9])ch\.?\s*0*(\d+(?:[.-]\d+)?)/i,
  /(?:^|[^a-z0-9])(?:volume|vol|tome)\.?\s*0*(\d+(?:[.-]\d+)?)/i,
  /(?:^|[^a-z0-9])v\.?\s*0*(\d+(?:[.-]\d+)?)/i,
  /(?:^|[_\s-])0*(\d+(?:[.-]\d+)?)(?=[_\s.-]|$)/,
];

/**
 * @description Normalise un libellé numérique ("049.10" → "49.10", "3-5" → "3.5").
 */
function normalizeNumberLabel(raw: string): string | null {
  const trimmed = raw.trim().replace(/-/g, ".");
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const [intRaw, ...decParts] = trimmed.split(".");
  const intPart = String(Number.parseInt(intRaw, 10));
  if (decParts.length === 0) {
    return intPart;
  }
  // Conserve les décimales telles quelles (49.1, 49.10 restent distincts si besoin)
  const dec = decParts.join(".").replace(/0+$/, "").replace(/\.$/, "");
  return dec ? `${intPart}.${dec}` : intPart;
}

/**
 * @description Lit l'index de tête style Mihon (`096a - Spin-off 01` → `96.1`).
 * Prioritaire sur « Chapitre 01 » / « Side Story 01 » dans le titre, sinon
 * les spin-off/bonus volent les petits numéros et tout est renuméroté.
 */
function parseLeadingIndexLabel(base: string): string | null {
  const match = base.match(/^(\d+)([a-z])?(?=\s*[-–—.]|\s+|$)/i);
  if (!match?.[1]) {
    return null;
  }
  const intPart = String(Number.parseInt(match[1], 10));
  if (!Number.isFinite(Number(intPart))) {
    return null;
  }
  const letter = match[2]?.toLowerCase();
  if (!letter) {
    return intPart;
  }
  // a → .1, b → .2… (080b, 096a…)
  const sub = letter.charCodeAt(0) - "a".charCodeAt(0) + 1;
  if (sub < 1 || sub > 26) {
    return intPart;
  }
  return `${intPart}.${sub}`;
}

/**
 * @description Extrait le libellé de volume/chapitre depuis un nom de fichier.
 * @param fileName - Nom brut (avec ou sans extension).
 * @returns Libellé ("49.1") ou null.
 */
export function parseArchiveEntryNumberLabel(
  fileName: string,
): string | null {
  const base = fileName.replace(ARCHIVE_FILE_RE, "").trim();
  if (!base) {
    return null;
  }

  const leading = parseLeadingIndexLabel(base);
  if (leading) {
    return leading;
  }

  for (const pattern of NUMBER_PATTERNS) {
    const match = base.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const normalized = normalizeNumberLabel(match[1]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/**
 * @description Extrait un numéro (éventuellement décimal) depuis un nom de fichier.
 * @deprecated Préférer parseArchiveEntryNumberLabel pour les sous-chapitres.
 */
export function parseArchiveEntryNumber(fileName: string): number | null {
  const label = parseArchiveEntryNumberLabel(fileName);
  if (!label) {
    return null;
  }
  const value = Number(label);
  return Number.isFinite(value) ? value : null;
}

/**
 * @description Extension d'un fichier (avec le point), ou chaîne vide.
 */
export function getArchiveExtension(fileName: string): string {
  const match = fileName.match(ARCHIVE_FILE_RE);
  return match ? match[0].toLowerCase() : "";
}

/**
 * @description Formate la partie numérique (049, 049.1, 01…).
 */
export function formatArchiveNumberPart(
  numberLabel: string,
  unit: LocalArchiveUnit,
): string {
  const width = unit === "chapter" ? 3 : 2;
  const [intRaw, ...decParts] = numberLabel.split(".");
  const intPart = String(Math.max(0, Number.parseInt(intRaw || "0", 10))).padStart(
    width,
    "0",
  );
  if (decParts.length === 0) {
    return intPart;
  }
  return `${intPart}.${decParts.join(".")}`;
}

/**
 * @description Formate un nom normalisé Volume/Chapitre (supporte 49.1).
 */
export function formatArchiveFileName(
  numberLabel: string | number,
  unit: LocalArchiveUnit,
  extension: string,
): string {
  const prefix = unit === "chapter" ? "Chapitre" : "Volume";
  const label =
    typeof numberLabel === "number"
      ? normalizeNumberLabel(String(numberLabel)) ?? String(numberLabel)
      : numberLabel;
  const padded = formatArchiveNumberPart(label, unit);
  const ext =
    extension.startsWith(".") || extension === ""
      ? extension
      : `.${extension}`;
  return `${prefix} ${padded}${ext}`;
}

/**
 * @description Construit la liste des renommages pour les entrées d'un dossier.
 * Conserve les sous-chapitres (49.1, 49.2…). Les fichiers sans numéro
 * reçoivent le prochain entier libre.
 * @param entries - Fichiers à renommer / ajouter.
 * @param unit - Volume ou chapitre.
 * @param existingEntries - Contenu déjà présent dans l'archive (réserve les numéros).
 */
export function buildArchiveFileRenames(
  entries: ArchiveSourceEntry[],
  unit: LocalArchiveUnit,
  existingEntries: ArchiveSourceEntry[] = [],
): ArchiveFileRename[] {
  const usable = entries.filter((entry) => {
    if (entry.name.startsWith(".")) {
      return false;
    }
    if (entry.name.toLowerCase() === "thumbs.db") {
      return false;
    }
    return entry.isDir || ARCHIVE_FILE_RE.test(entry.name);
  });

  type Draft = {
    fromName: string;
    extension: string;
    parsed: string | null;
    sortKey: number;
  };

  const drafts: Draft[] = usable.map((entry) => {
    const parsed = parseArchiveEntryNumberLabel(entry.name);
    return {
      fromName: entry.name,
      extension: entry.isDir ? "" : getArchiveExtension(entry.name),
      parsed,
      sortKey: parsed != null ? Number(parsed) : Number.POSITIVE_INFINITY,
    };
  });

  drafts.sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    return a.fromName.localeCompare(b.fromName, "fr", { numeric: true });
  });

  const claimed = new Set<string>();
  const usedNames = new Set<string>(
    existingEntries.map((entry) => entry.name.toLowerCase()),
  );

  for (const existing of existingEntries) {
    const label = parseArchiveEntryNumberLabel(existing.name);
    if (label) {
      claimed.add(label);
    }
  }

  let nextFree = 1;
  const takeNextFree = (): string => {
    while (claimed.has(String(nextFree))) {
      nextFree += 1;
    }
    const value = String(nextFree);
    claimed.add(value);
    nextFree += 1;
    return value;
  };

  return drafts.map((draft) => {
    let numberLabel: string;
    let detected = false;
    if (draft.parsed != null && !claimed.has(draft.parsed)) {
      numberLabel = draft.parsed;
      claimed.add(numberLabel);
      detected = true;
    } else {
      numberLabel = takeNextFree();
    }

    let toName = formatArchiveFileName(numberLabel, unit, draft.extension);
    while (usedNames.has(toName.toLowerCase())) {
      numberLabel = takeNextFree();
      toName = formatArchiveFileName(numberLabel, unit, draft.extension);
      detected = false;
    }
    usedNames.add(toName.toLowerCase());

    return {
      fromName: draft.fromName,
      toName,
      numberLabel,
      sortKey: Number(numberLabel),
      detected,
    };
  });
}

/**
 * @description Choisit Volume vs Chapitre pour le renommage (heuristique + fiche).
 */
export function resolveArchiveRenameUnit(
  entries: ArchiveSourceEntry[],
  fallback: LocalArchiveUnit,
): LocalArchiveUnit {
  let chapterHints = 0;
  let volumeHints = 0;
  for (const entry of entries) {
    const name = entry.name;
    if (
      /(?:^|[^a-z0-9])(?:ch\.?|chapter|chapitre|chap)(?=[\s._-]|\d)/i.test(
        name,
      )
    ) {
      chapterHints += 1;
    }
    if (
      /(?:^|[^a-z0-9])(?:vol\.?|volume|tome)(?=[\s._-]|\d)/i.test(name)
    ) {
      volumeHints += 1;
    }
  }
  if (chapterHints > volumeHints && chapterHints > 0) {
    return "chapter";
  }
  if (volumeHints > chapterHints && volumeHints > 0) {
    return "volume";
  }
  return fallback;
}

/**
 * @description Ajoute le suffixe `-scan` avant l'extension (autre source).
 * No-op si le nom se termine déjà par `-scan` (avec ou sans extension).
 */
export function applyScanArchiveSuffix(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return trimmed;
  }
  const lastDot = trimmed.lastIndexOf(".");
  const hasExt =
    lastDot > 0 && lastDot < trimmed.length - 1 && !trimmed.includes("/", lastDot);
  const base = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  const ext = hasExt ? trimmed.slice(lastDot) : "";
  if (/-scan$/i.test(base)) {
    return trimmed;
  }
  return `${base}-scan${ext}`;
}

/**
 * @description Prépare les mappings d'ajout : applique `-scan` si fusion scan.
 * Sans mappings existants, génère from → from-scan pour chaque basename source.
 */
export function resolveAppendRenameMappings(
  mappings: ReadonlyArray<{ fromName: string; toName: string }>,
  sourcePaths: string[],
  mergeStyle: "direct" | "scan",
): Array<{ fromName: string; toName: string }> | undefined {
  if (mergeStyle === "direct") {
    return mappings.length > 0
      ? mappings.map((item) => ({
          fromName: item.fromName,
          toName: item.toName,
        }))
      : undefined;
  }

  if (mappings.length > 0) {
    return mappings.map((item) => ({
      fromName: item.fromName,
      toName: applyScanArchiveSuffix(item.toName),
    }));
  }

  const generated: Array<{ fromName: string; toName: string }> = [];
  for (const path of sourcePaths) {
    const parts = path.replace(/\//g, "\\").split("\\").filter(Boolean);
    const fromName = parts[parts.length - 1];
    if (!fromName) {
      continue;
    }
    generated.push({
      fromName,
      toName: applyScanArchiveSuffix(fromName),
    });
  }
  return generated.length > 0 ? generated : undefined;
}
