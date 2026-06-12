import { isTauriRuntime } from "@/lib/platform";
import { TAMPERMONKEY_SCRIPT_FILENAME } from "@/lib/tampermonkey";
import tampermonkeyScriptContent from "../../public/tampermonkey/Nautiljon-Mangatheque.user.js?raw";

/**
 * @description Retourne le contenu du userscript embarqué au build (évite un fetch fragile en Tauri).
 */
function getScriptContent(): string {
  return tampermonkeyScriptContent;
}

async function saveViaTauriDialog(content: string): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const { downloadDir, join } = await import("@tauri-apps/api/path");

  const downloads = await downloadDir();
  const defaultPath = await join(downloads, TAMPERMONKEY_SCRIPT_FILENAME);

  const filePath = await save({
    defaultPath,
    title: "Enregistrer le script Tampermonkey",
    filters: [
      {
        name: "Userscript JavaScript",
        extensions: ["js"],
      },
    ],
  });

  if (!filePath) {
    return false;
  }

  await writeTextFile(filePath, content);
  return true;
}

async function saveViaBrowserPicker(content: string): Promise<boolean> {
  if (!("showSaveFilePicker" in window)) {
    return false;
  }

  const picker = (
    window as Window & {
      showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  const handle = await picker({
    suggestedName: TAMPERMONKEY_SCRIPT_FILENAME,
    types: [
      {
        description: "Userscript Tampermonkey",
        accept: { "text/javascript": [".user.js", ".js"] },
      },
    ],
  });

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return true;
}

function saveViaAnchorDownload(content: string): void {
  const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = TAMPERMONKEY_SCRIPT_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type TampermonkeyDownloadResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: string };

/**
 * @description Propose une fenêtre « Enregistrer sous » puis écrit le userscript Nautiljon.
 */
export async function downloadTampermonkeyScript(): Promise<TampermonkeyDownloadResult> {
  try {
    const content = getScriptContent();
    if (!content.trim()) {
      throw new Error("Le script userscript est vide ou introuvable.");
    }

    if (isTauriRuntime()) {
      const saved = await saveViaTauriDialog(content);
      return { ok: true, saved };
    }

    try {
      const saved = await saveViaBrowserPicker(content);
      if (saved) {
        return { ok: true, saved: true };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { ok: true, saved: false };
      }
      throw error;
    }

    saveViaAnchorDownload(content);
    return { ok: true, saved: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erreur de téléchargement.";
    return { ok: false, error: message };
  }
}
