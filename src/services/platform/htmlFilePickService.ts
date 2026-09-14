import { isDesktopRuntime } from "@/lib/platform";

export interface PickedHtmlFile {
  /** Contenu HTML du fichier. */
  text: string;
  /** Nom affiché (fichier ou chemin). */
  name: string;
}

/**
 * @description Ouvre un sélecteur de fichier HTML (dialog Tauri desktop, sinon input file).
 */
export async function pickHtmlFile(): Promise<PickedHtmlFile | null> {
  if (isDesktopRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      multiple: false,
      title: "Choisir la page HTML du planning Nautiljon",
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (!selected || Array.isArray(selected)) {
      return null;
    }
    const text = await readTextFile(selected);
    const name = selected.split(/[/\\]/).pop() || selected;
    return { text, name };
  }

  return pickHtmlFileViaHtmlInput();
}

/**
 * @description Sélecteur HTML navigateur / mobile.
 */
function pickHtmlFileViaHtmlInput(): Promise<PickedHtmlFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "text/html,.html,.htm";
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
        resolve({ text, name: file.name });
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
