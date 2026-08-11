import { invoke } from "@tauri-apps/api/core";
import { isDesktopRuntime, isTauriRuntime } from "@/lib/platform";

/** Entrée listée dans un dossier source. */
export interface LocalArchiveEntry {
  name: string;
  isDir: boolean;
}

/** Résultat d'inspection d'une source. */
export interface LocalArchiveInspectResult {
  path: string;
  isDir: boolean;
  name: string;
  entryCount: number;
  entries: LocalArchiveEntry[];
  sizeBytes: number;
}

/** Résultat d'un déplacement. */
export interface LocalArchiveMoveResult {
  path: string;
  sizeBytes: number;
}

/** Mapping de renommage envoyé au backend. */
export interface LocalArchiveRenameMapping {
  fromName: string;
  toName: string;
}

/**
 * @description Indique si les archives locales FS sont disponibles.
 */
export function canUseLocalArchives(): boolean {
  return isTauriRuntime() && isDesktopRuntime();
}

/**
 * @description Inspecte un chemin source (dossier ou fichier).
 */
export async function inspectLocalArchivePath(
  path: string,
): Promise<LocalArchiveInspectResult> {
  if (!canUseLocalArchives()) {
    throw new Error("Archives locales disponibles uniquement sur desktop.");
  }
  return invoke<LocalArchiveInspectResult>("local_archive_inspect", { path });
}

/**
 * @description Déplace les sources vers le dossier série cible.
 * @param sources - Chemins source.
 * @param destination - Dossier série cible.
 * @param renames - Renommages optionnels (noms dans le dossier / fichiers déposés).
 * @param onExisting - Si la destination existe : `merge` ou `replace`.
 */
export async function moveLocalArchive(
  sources: string[],
  destination: string,
  renames?: LocalArchiveRenameMapping[],
  onExisting?: "merge" | "replace",
): Promise<LocalArchiveMoveResult> {
  if (!canUseLocalArchives()) {
    throw new Error("Archives locales disponibles uniquement sur desktop.");
  }
  return invoke<LocalArchiveMoveResult>("local_archive_move", {
    sources,
    destination,
    renames: renames && renames.length > 0 ? renames : null,
    onExisting: onExisting ?? null,
  });
}

/**
 * @description Mesure la taille d'un chemin existant.
 */
export async function measureLocalArchiveSize(path: string): Promise<number> {
  if (!canUseLocalArchives()) {
    throw new Error("Archives locales disponibles uniquement sur desktop.");
  }
  return invoke<number>("local_archive_measure_size", { path });
}

/**
 * @description Déplace une archive déjà rangée vers un nouvel emplacement.
 */
export async function relocateLocalArchive(
  source: string,
  destination: string,
): Promise<LocalArchiveMoveResult> {
  if (!canUseLocalArchives()) {
    throw new Error("Archives locales disponibles uniquement sur desktop.");
  }
  return invoke<LocalArchiveMoveResult>("local_archive_relocate", {
    source,
    destination,
  });
}

/**
 * @description Ajoute des fichiers dans un dossier d'archive existant (déplacement).
 */
export async function addFilesToLocalArchive(
  sources: string[],
  destination: string,
  renames?: LocalArchiveRenameMapping[],
): Promise<LocalArchiveMoveResult> {
  if (!canUseLocalArchives()) {
    throw new Error("Archives locales disponibles uniquement sur desktop.");
  }
  return invoke<LocalArchiveMoveResult>("local_archive_add_files", {
    sources,
    destination,
    renames: renames && renames.length > 0 ? renames : null,
  });
}

/**
 * @description Ouvre le dossier dans l'explorateur système.
 */
export async function openLocalArchivePath(path: string): Promise<void> {
  if (!canUseLocalArchives()) {
    throw new Error("Archives locales disponibles uniquement sur desktop.");
  }
  await invoke("local_archive_open", { path });
}

/**
 * @description Vérifie si le chemin existe encore sur le disque.
 */
export async function localArchivePathExists(path: string): Promise<boolean> {
  if (!canUseLocalArchives()) {
    return false;
  }
  return invoke<boolean>("local_archive_path_exists", { path });
}

/**
 * @description Ouvre un sélecteur de dossier (dialog Tauri).
 */
export async function pickLocalArchiveFolder(): Promise<string | null> {
  if (!canUseLocalArchives()) {
    return null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choisir le dossier d'archive à ranger",
  });
  if (!selected || Array.isArray(selected)) {
    return null;
  }
  return selected;
}

/**
 * @description Ouvre un sélecteur multi-fichiers (PC ou tablette MTP sous Windows).
 * Les fichiers tablette sont copiés vers un dossier temporaire avant classement.
 */
export async function pickLocalArchiveSources(): Promise<string[]> {
  if (!canUseLocalArchives()) {
    return [];
  }
  return invoke<string[]>("local_archive_pick_sources");
}
