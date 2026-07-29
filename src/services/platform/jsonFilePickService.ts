import { isDesktopRuntime, isTauriRuntime } from "@/lib/platform";

export interface PickedJsonFile {
  /** Contenu texte du fichier. */
  text: string;
  /** Nom affiché (fichier ou chemin). */
  name: string;
  /**
   * Chemin absolu Tauri (desktop uniquement).
   * Absent pour l'input HTML (mobile / navigateur).
   */
  path: string | null;
}

/**
 * @description Ouvre un sélecteur JSON (dialog Tauri desktop, sinon input file).
 */
export async function pickJsonFile(): Promise<PickedJsonFile | null> {
  if (isDesktopRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      multiple: false,
      title: "Joindre un export JSON Nautiljon",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) {
      return null;
    }
    const text = await readTextFile(selected);
    const name = selected.split(/[/\\]/).pop() || selected;
    return { text, name, path: selected };
  }

  return pickJsonFileViaHtmlInput();
}

/**
 * @description Sélecteur HTML (Android / iOS / navigateur) — pas de chemin filesystem.
 */
function pickJsonFileViaHtmlInput(): Promise<PickedJsonFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      void file.text().then((text) => {
        cleanup();
        resolve({ text, name: file.name, path: null });
      });
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * @description Supprime le fichier source après import réussi (desktop Tauri uniquement).
 * @returns true si le fichier a été effacé.
 */
export async function deletePickedJsonFile(
  path: string | null | undefined,
): Promise<boolean> {
  if (!path || !isTauriRuntime() || !isDesktopRuntime()) {
    return false;
  }
  try {
    const { remove } = await import("@tauri-apps/plugin-fs");
    await remove(path);
    return true;
  } catch (err) {
    console.warn("[json] Suppression fichier impossible :", err);
    return false;
  }
}
