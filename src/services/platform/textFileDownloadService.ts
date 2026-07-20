import { isTauriRuntime } from "@/lib/platform";

export type TextFileDownloadOptions = {
  content: string;
  filename: string;
  /** Type MIME du fichier (défaut : text/plain). */
  mimeType?: string;
  /** Titre de la boîte de dialogue native. */
  dialogTitle?: string;
  /** Libellé du filtre de fichiers (desktop). */
  fileFilterName?: string;
  /** Extensions sans point (défaut : dérivé du nom de fichier, sinon txt). */
  extensions?: string[];
};

export type TextFileDownloadResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: string };

/**
 * @description Déduit l'extension fichier depuis un nom (sans le point).
 */
function extensionFromFilename(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match?.[1]?.toLowerCase() ?? "txt";
}

/**
 * @description Enregistre un fichier texte via la boîte de dialogue Tauri.
 */
async function saveViaTauriDialog(
  options: Required<
    Pick<TextFileDownloadOptions, "content" | "filename" | "dialogTitle" | "fileFilterName" | "extensions">
  >,
): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const { downloadDir, join } = await import("@tauri-apps/api/path");

  const downloads = await downloadDir();
  const defaultPath = await join(downloads, options.filename);

  const filePath = await save({
    defaultPath,
    title: options.dialogTitle,
    filters: [
      {
        name: options.fileFilterName,
        extensions: options.extensions,
      },
    ],
  });

  if (!filePath) {
    return false;
  }

  await writeTextFile(filePath, options.content);
  return true;
}

/**
 * @description Enregistre via l'API File System Access du navigateur.
 */
async function saveViaBrowserPicker(
  options: Required<
    Pick<TextFileDownloadOptions, "content" | "filename" | "mimeType" | "fileFilterName" | "extensions">
  >,
): Promise<boolean> {
  if (!("showSaveFilePicker" in window)) {
    return false;
  }

  const picker = (
    window as Window & {
      showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  const accept: Record<string, string[]> = {
    [options.mimeType]: options.extensions.map((ext) => `.${ext}`),
  };

  const handle = await picker({
    suggestedName: options.filename,
    types: [
      {
        description: options.fileFilterName,
        accept,
      },
    ],
  });

  const writable = await handle.createWritable();
  await writable.write(options.content);
  await writable.close();
  return true;
}

/**
 * @description Déclenche un téléchargement navigateur via une ancre.
 */
function saveViaAnchorDownload(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * @description Propose l'enregistrement d'un fichier texte (Tauri, File System Access, ou téléchargement).
 * @param options - Contenu, nom de fichier et métadonnées de dialogue.
 * @returns Résultat : succès (éventuellement annulé) ou erreur.
 */
export async function downloadTextFile(
  options: TextFileDownloadOptions,
): Promise<TextFileDownloadResult> {
  const mimeType = options.mimeType ?? "text/plain";
  const dialogTitle = options.dialogTitle ?? "Enregistrer le fichier";
  const fileFilterName = options.fileFilterName ?? "Fichier texte";
  const extensions =
    options.extensions ?? [extensionFromFilename(options.filename)];

  try {
    if (!options.content.trim()) {
      throw new Error("Le contenu à exporter est vide.");
    }

    if (isTauriRuntime()) {
      const saved = await saveViaTauriDialog({
        content: options.content,
        filename: options.filename,
        dialogTitle,
        fileFilterName,
        extensions,
      });
      return { ok: true, saved };
    }

    try {
      const saved = await saveViaBrowserPicker({
        content: options.content,
        filename: options.filename,
        mimeType,
        fileFilterName,
        extensions,
      });
      if (saved) {
        return { ok: true, saved: true };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { ok: true, saved: false };
      }
      throw error;
    }

    saveViaAnchorDownload(options.content, options.filename, mimeType);
    return { ok: true, saved: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur d'enregistrement.";
    return { ok: false, error: message };
  }
}
