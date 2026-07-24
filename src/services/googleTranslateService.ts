const GOOGLE_TRANSLATE_URL =
  "https://translate.googleapis.com/translate_a/single";

const MAX_CHARS = 5000;

/**
 * @description Traduit un texte via l’API Google Translate non officielle (client=gtx).
 * @param text - Texte source (sera tronqué à 5000 caractères).
 * @param sourceLang - Langue source (`en`, `auto`, …).
 * @param targetLang - Langue cible (défaut `fr`).
 * @returns Texte traduit.
 * @throws Si la réponse est invalide ou vide.
 */
export async function translateText(
  text: string,
  sourceLang = "auto",
  targetLang = "fr",
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Aucun texte à traduire.");
  }

  const payload =
    trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;

  const params = new URLSearchParams({
    client: "gtx",
    sl: sourceLang,
    tl: targetLang,
    dt: "t",
    q: payload,
  });

  const response = await fetch(`${GOOGLE_TRANSLATE_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Traduction impossible (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Réponse de traduction invalide.");
  }

  const parts: string[] = [];
  for (const segment of data[0] as unknown[]) {
    if (Array.isArray(segment) && typeof segment[0] === "string" && segment[0]) {
      parts.push(segment[0]);
    }
  }

  const result = parts.join("").trim();
  if (!result) {
    throw new Error("Aucune traduction reçue.");
  }

  return result;
}
