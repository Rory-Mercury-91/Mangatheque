/** Couleur des pastilles et libellés Mihon. */
export const MIHON_COLOR = "#22d3ee";

/** Texte affiché sur les pastilles Mihon. */
export const MIHON_BADGE_LABEL = "Mihon";

/** Clés internes normalisées (sans accent). */
type OwnerKey = "celine" | "sebastien" | "alexandre";

const OWNER_COLOR_BY_KEY: Record<OwnerKey, string> = {
  celine: "#eab308",
  sebastien: "#22c55e",
  alexandre: "#3b82f6",
};

/** Libellés courts pour pastilles. */
const OWNER_BADGE_BY_KEY: Record<OwnerKey, string> = {
  celine: "Céline",
  sebastien: "Sébastien",
  alexandre: "Alex",
};

/** Noms complets pour cartes et tooltips. */
const OWNER_DISPLAY_BY_KEY: Record<OwnerKey, string> = {
  celine: "Céline",
  sebastien: "Sébastien",
  alexandre: "Alexandre",
};

const DEFAULT_OWNER_COLOR = "#6366f1";
const DEFAULT_OWNER_BADGE = "?";

export type OwnerBadgeVariant = "purchase" | "mihon";

/**
 * @description Normalise un nom de propriétaire pour la recherche couleur / libellé.
 * @param name - Nom en base ou affiché.
 */
function normalizeOwnerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * @description Résout la clé interne d'un propriétaire connu.
 * @param name - Nom en base (avec ou sans accent).
 */
function resolveOwnerKey(name: string): OwnerKey | null {
  const normalized = normalizeOwnerName(name);

  if (normalized.startsWith("celine") || normalized === "c") {
    return "celine";
  }
  if (normalized.startsWith("sebastien") || normalized === "s") {
    return "sebastien";
  }
  if (normalized.startsWith("alexandre") || normalized === "alex") {
    return "alexandre";
  }

  return null;
}

/**
 * @description Résout l'identifiant propriétaire depuis un nom (import Mihon).
 * @param owners - Liste des propriétaires du foyer.
 * @param name - Nom saisi (ex. « Céline », « Alex »).
 */
export function resolveOwnerIdByName(
  owners: Array<{ id: string; name: string }>,
  name: string | null | undefined,
): string | null {
  if (!name?.trim() || owners.length === 0) {
    return null;
  }

  const targetKey = resolveOwnerKey(name);
  if (targetKey) {
    const match = owners.find((owner) => resolveOwnerKey(owner.name) === targetKey);
    if (match) {
      return match.id;
    }
  }

  const normalized = normalizeOwnerName(name);
  const exact = owners.find(
    (owner) => normalizeOwnerName(owner.name) === normalized,
  );
  return exact?.id ?? null;
}

/**
 * @description Retourne la couleur fixe d'un propriétaire selon son nom.
 * @param name - Nom du propriétaire.
 */
export function getOwnerColor(name: string): string {
  const key = resolveOwnerKey(name);
  return key ? OWNER_COLOR_BY_KEY[key] : DEFAULT_OWNER_COLOR;
}

/**
 * @description Retourne le libellé fixe de pastille achat d'un propriétaire.
 * @param name - Nom du propriétaire.
 */
export function getOwnerBadgeLabel(name: string): string {
  const key = resolveOwnerKey(name);
  return key ? OWNER_BADGE_BY_KEY[key] : DEFAULT_OWNER_BADGE;
}

/**
 * @description Retourne le nom complet affiché (cartes financières, tooltips).
 * @param name - Nom du propriétaire en base.
 */
export function getOwnerDisplayName(name: string): string {
  const key = resolveOwnerKey(name);
  return key ? OWNER_DISPLAY_BY_KEY[key] : name;
}

/**
 * @description Retourne le texte affiché sur une pastille (achat ou Mihon).
 * @param name - Nom du propriétaire.
 * @param variant - Type de pastille.
 */
export function getOwnerBadgeText(
  name: string,
  variant: OwnerBadgeVariant = "purchase",
): string {
  if (variant === "mihon") {
    return MIHON_BADGE_LABEL;
  }
  return getOwnerBadgeLabel(name);
}

/**
 * @description Libellé compact « Achat : … » / « Mihon : … » pour les pastilles d'appartenance.
 * @param name - Nom du propriétaire.
 * @param variant - Type de pastille.
 */
export function getOwnerOwnershipBadgeText(
  name: string,
  variant: OwnerBadgeVariant = "purchase",
): string {
  const displayName = getOwnerDisplayName(name);
  return variant === "mihon" ? `Mihon : ${displayName}` : `Achat : ${displayName}`;
}
