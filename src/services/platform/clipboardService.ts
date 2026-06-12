/**
 * @description Lit le texte du presse-papiers (API navigateur).
 * @returns Contenu texte ou chaîne vide.
 * @throws Si la lecture est refusée ou indisponible.
 */
export async function readClipboardText(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    throw new Error("Lecture du presse-papiers indisponible sur cet appareil.");
  }

  const text = await navigator.clipboard.readText();
  return text ?? "";
}
